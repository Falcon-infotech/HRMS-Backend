import moment from "moment-timezone";
import AttendanceModel from "../models/attendanceModule.js";

import holidayModel from "../models/holidayModule.js";
import { formatAttendanceRecord } from "../utils/attendanceUtils.js";
import LeaveModel from "../models/leaveModel.js";
import ExcelJS from "exceljs";
import axios from "axios";
import path from "path";
import fs from "fs";
import { sendNotification } from "../utils/notificationutils.js";
import branchModel from "../models/branchModel.js";
import { buildFullAttendanceHistory, getBranchHolidaysForUser, getHolidaysForBranches, withoutDeletedUsers } from "../utils/commonUtils.js";
import userModel from "../models/userModel.js";
import { count } from "console";

// ✅ Punch IN
export const markInTime = async (req, res) => {
  try {
    const userId = req.user._id;
    const { location } = req.body;
    const latitude = location?.latitude;
    const longitude = location?.longitude;

    const user = await userModel.findById(userId).populate("branch", "_id branchName");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const userTimeZone = user.timeZone || "UTC";

    // ✅ Always use UTC date (YYYY-MM-DD)
    const date = moment().utc().format("YYYY-MM-DD");
    const currentDay = moment().tz(userTimeZone).format("dddd");

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: "Location coordinates required" });
    }

    const existing = await AttendanceModel.findOne({ userId, date });
    const branchWeekends = user.branch?.weekends || [];

    if (branchWeekends.includes(currentDay)) {
      return res.status(400).json({
        success: false,
        message: `Today is a weekend (${currentDay}) for your branch.`,
      });
    }

    if (existing && existing.inTime) {
      return res.status(400).json({ success: false, message: "Already punched in today" });
    }

    // Reverse geocoding
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { "User-Agent": process.env.NOMINATION_USER_AGENT } }
    );

    let address = response?.data?.display_name || JSON.stringify(response?.data?.address);
    const userAgent = req.headers["user-agent"] || "";
    let punchedFrom = /mobile/i.test(userAgent) ? "Mobile" : /PostmanRuntime/i.test(userAgent) ? "Postman" : "Web";

    // ✅ Store in UTC
    const inTime = new Date();

    // Status calculation (use user timezone for logic)
    const nineFifteen = moment.tz(`${moment().format("YYYY-MM-DD")} 09:15`, "YYYY-MM-DD HH:mm", userTimeZone);
    let todayStatus = moment(inTime).tz(userTimeZone).isAfter(nineFifteen) ? "Present" : "Present";

    if (todayStatus === "Present" && moment(inTime).tz(userTimeZone).isAfter(nineFifteen)) {
      await sendNotification({
        forRoles: ["admin", "hr"],
        title: "Late Punch IN Alert",
        message: `${user.first_name} ${user.last_name} logged in late today at ${moment(inTime)
          .tz(userTimeZone)
          .format("hh:mm A")}`,
        link: `/attendance`,
        type: "user",
        performedBy: user._id,
      });
    }

    // Check holidays (user timezone)
    const holidays = await getBranchHolidaysForUser(user);
    const todayHoliday = holidays.find(
      (h) => moment(h.date).tz(userTimeZone).format("YYYY-MM-DD") === moment().tz(userTimeZone).format("YYYY-MM-DD")
    );
    if (todayHoliday) todayStatus = "Holiday";

    // Upsert attendance
    const attendanceStatus = await AttendanceModel.findOneAndUpdate(
      { userId, date },
      {
        $set: {
          inTime,
          outTime: null,
          status: todayStatus,
          userName: `${user.first_name} ${user.last_name}`,
          userEmail: user.email,
          "location.checkIn": { latitude, longitude, address, punchedFrom },
        },
      },
      { upsert: true, new: true }
    );

    const responseAttendance = {
      ...attendanceStatus.toObject(),
      inTime: moment(attendanceStatus.inTime).format("YYYY-MM-DD HH:mm"),
      outTime: attendanceStatus.outTime
        ? moment(attendanceStatus.outTime).format("YYYY-MM-DD HH:mm")
        : null,
    };

    // console.log("Punched IN:", responseAttendance);

    res.status(200).json({
      success: true,
      message: "Punched IN successfully",
      attendance: attendanceStatus,
      punchedFrom,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to punch IN", error: err.message });
  }
};

// ✅ Punch OUT
export const markOutTime = async (req, res) => {
  try {
    const userId = req.user._id;
    const { location } = req.body;
    const latitude = location?.latitude;
    const longitude = location?.longitude;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: "Location coordinates required" });
    }

    const user = await userModel.findById(userId);
    const userTimeZone = user.timeZone || "UTC";

    // ✅ Always UTC
    const date = moment().utc().format("YYYY-MM-DD");

    let attendance = await AttendanceModel.findOne({ userId, date });
    if (!attendance || !attendance.inTime) {
      return res.status(400).json({ success: false, message: "You must punch in first" });
    }
    if (attendance.outTime) {
      return res.status(400).json({ success: false, message: "Already punched out today" });
    }

    const inTime = new Date(attendance.inTime); // UTC
    const outTime = new Date(); // UTC now

    // Work duration
    const durationMs = outTime - inTime;
    const duration = moment.utc(durationMs).format("HH:mm:ss");

    // Reverse geocode
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: { "User-Agent": process.env.NOMINATION_USER_AGENT } }
    );

    const address = response?.data?.address;
    const displayName = response?.data?.display_name;

    const userAgent = req.headers["user-agent"] || "";
    let punchedFrom = /mobile/i.test(userAgent) ? "Mobile" : /PostmanRuntime/i.test(userAgent) ? "Postman" : "Web";

    // Attendance status logic
    let todayStatus = "Absent";
    const nineFifteen = moment.tz(`${moment().format("YYYY-MM-DD")} 09:15`, "YYYY-MM-DD HH:mm", userTimeZone);

    if (moment(inTime).tz(userTimeZone).isSameOrBefore(nineFifteen)) {
      todayStatus = "Present";
    } else {
      const workHours = moment.duration(moment(outTime).diff(inTime)).asHours();
      todayStatus = workHours < 9 ? "Present" : "Present";
    }

    // Holidays (check in user timezone)
    const holidays = await getBranchHolidaysForUser(user);
    const holiday = holidays.find(
      (h) => moment(h.date).tz(userTimeZone).format("YYYY-MM-DD") === moment().tz(userTimeZone).format("YYYY-MM-DD")
    );
    if (holiday) {
      if (!attendance.inTime && !attendance.outTime) {
        todayStatus = "Holiday";
      } else {
        todayStatus = "Over Time";
        await sendNotification({
          forRoles: ["admin", "hr"],
          title: `${user.first_name} ${user.last_name} Working Over Time`,
          message: `${user.first_name} ${user.last_name} is working on Holiday as Over Time`,
          type: "user",
          performedBy: user._id,
        });
      }
    }

    // Update attendance
    attendance = await AttendanceModel.findOneAndUpdate(
      { userId, date },
      {
        $set: {
          outTime,
          duration,
          status: todayStatus,
          userName: `${user.first_name} ${user.last_name}`,
          userEmail: user.email,
          "location.checkOut": { latitude, longitude, address, displayName, punchedFrom },
        },
      },
      { upsert: true, new: true }
    );
    const responseAttendance = {
      ...attendance.toObject(),
      inTime: attendance.inTime
        ? moment(attendance.inTime).format("YYYY-MM-DD HH:mm") // Case 2: same label
        : null,
      outTime: attendance.outTime
        ? moment(attendance.outTime).format("YYYY-MM-DD HH:mm") // Case 2: same label
        : null,
    };

    res.status(200).json({
      success: true,
      message: "Punched OUT successfully",
      attendance: attendance,
      punchedFrom,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to punch OUT", error: err.message });
  }
};


// Get today's attendance (UTC safe)
export const getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch user with branch
    const user = await userModel.findById(userId).populate("branch");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.timeZone) {
      return res.status(400).json({
        success: false,
        message: "User timezone not set. Please update user profile.",
      });
    }

    const userTimeZone = user.timeZone || "UTC";

    // Today's date in user's timezone
    const today = moment().tz(userTimeZone).format("YYYY-MM-DD");
    const currentDay = moment().tz(userTimeZone).format("dddd");

    const branch = user.branch;
    if (!branch) {
      return res.status(400).json({ success: false, message: "User branch not found" });
    }

    if (!Array.isArray(branch.weekends) || branch.weekends.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Branch weekends not configured. Please update branch settings.",
      });
    }

    const branchWeekends = branch.weekends;
    const isWeekend = branchWeekends.includes(currentDay);

    // Check branch-specific holidays
    const holidays = await getBranchHolidaysForUser(user);
    const todayHoliday = holidays.find(
      (h) => moment(h.date).tz(userTimeZone).format("YYYY-MM-DD") === today
    );

    // Fetch or create today's attendance
    let attendance = await AttendanceModel.findOne({ userId, date: today });
    let attendanceResponse = {};

    if (todayHoliday) {
      if (!attendance) {
        attendance = await AttendanceModel.create({
          userId,
          date: today,
          inTime: null,
          outTime: null,
          status: "Holiday",
          location: { checkIn: null, checkOut: null }
        });

        attendanceResponse = {
          ...attendance.toObject(),
          inTime: null,
          outTime: null
        };
      } else {
        attendance.status = "Holiday";
        await attendance.save();
        attendanceResponse = {
          ...attendance.toObject(),
          inTime: null,
          outTime: null
        };
      }
      attendanceResponse = {
        ...attendance.toObject(),
        inTime: attendance.inTime ? moment(attendance.inTime).format("YYYY-MM-DD HH:mm") : null,
        outTime: attendance.outTime ? moment(attendance.outTime).format("YYYY-MM-DD HH:mm") : null,
      };

      return res.status(200).json({
        success: true,
        message: `Today is a holiday for branch: ${branch.name}`,
        date: today,
        attendance: attendance,
        branch: {
          name: branch.name,
          weekends: branchWeekends,
        },
      });
    }

    if (!attendance) {
      attendance = await AttendanceModel.create({
        userId,
        date: today,
        inTime: null,
        outTime: null,
        status: isWeekend ? "Weekend" : "Absent",
        location: { checkIn: null, checkOut: null }

      });
      attendanceResponse = {
        ...attendance.toObject(),
        inTime: null,
        outTime: null
      };
    } else if (!attendance.inTime && !attendance.outTime) {
      attendance.status = isWeekend ? "Weekend" : "Absent";
      await attendance.save();
    }

    // Populate user details
    await attendance.populate(
      "userId",
      "first_name last_name email status department designation salary role"
    );

    attendanceResponse = {
      ...attendance.toObject(),
      inTime: attendance.inTime ? moment(attendance.inTime).tz(userTimeZone).format("YYYY-MM-DD HH:mm") : null,
      outTime: attendance.outTime ? moment(attendance.outTime).tz(userTimeZone).format("YYYY-MM-DD HH:mm") : null,
    };


    res.status(200).json({
      success: true,
      message: "Today's attendance fetched successfully",
      date: today,
      attendance: attendance,
      branch: {
        name: branch.name,
        weekends: branchWeekends,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch today's attendance",
      error: err.message,
    });
  }
};


// Get single user's attendance by date
export const getSingleUserAttendanceByDate = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date } = req.query; // format: YYYY-MM-DD

    // ✅ Fetch user with branch
    const user = await userModel.findById(userId).populate("branch");
    if (!user) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "User not found",
      });
    }

    if (!user.timeZone) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "User timezone not set. Please update user profile.",
      });
    }

    const userTimeZone = user.timeZone;

    // ✅ Target date in user's timezone
    const targetDate = date
      ? moment.tz(date, "YYYY-MM-DD", userTimeZone)
      : moment().tz(userTimeZone);

    const dateKey = targetDate.format("YYYY-MM-DD"); // save date as string
    const currentDay = targetDate.format("dddd");

    const branch = user.branch;
    if (!branch) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "User branch not found",
      });
    }

    if (!Array.isArray(branch.weekends) || branch.weekends.length === 0) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Branch weekends not configured. Please update branch settings.",
      });
    }

    const branchWeekends = branch.weekends;
    const isWeekend = branchWeekends.includes(currentDay);

    // ✅ Check branch-specific holiday
    const holidays = await getBranchHolidaysForUser(user);
    const holiday = holidays.find(
      (h) => moment(h.date).tz(userTimeZone).format("YYYY-MM-DD") === dateKey
    );

    // ✅ Get attendance for that user + date
    let attendance = await AttendanceModel.findOne({ userId, date: dateKey });
    let attendanceResponse = {};

    if (holiday) {
      if (!attendance) {
        attendance = await AttendanceModel.create({
          userId,
          date: dateKey,
          inTime: null,
          outTime: null,
          status: "Holiday",
          location: { checkIn: null, checkOut: null },
        });

        attendanceResponse = {
          ...attendance.toObject(),
          inTime: null,
          outTime: null
        };
      } else if (attendance.status !== "Holiday") {
        attendance.status = "Holiday";
        await attendance.save();

        attendanceResponse = {
          ...attendance.toObject(),
          inTime: null,
          outTime: null
        };
      }

      attendanceResponse = {
        ...attendance.toObject(),
        inTime: attendance.inTime ? moment(attendance.inTime).format("YYYY-MM-DD HH:mm") : null,
        outTime: attendance.outTime ? moment(attendance.outTime).format("YYYY-MM-DD HH:mm") : null,
      };

      return res.status(200).json({
        success: true,
        statusCode: 200,
        message: `Date ${dateKey} is a holiday for branch: ${branch.branchName}`,
        date: dateKey,
        attendance: attendance,
        branch: {
          name: branch.branchName,
          weekends: branchWeekends,
        },
      });
    }

    // ✅ If no holiday → mark weekend / absent
    if (!attendance) {
      attendance = await AttendanceModel.create({
        userId,
        date: dateKey,
        inTime: null,
        outTime: null,
        status: isWeekend ? "Weekend" : "Absent",
        location: { checkIn: null, checkOut: null },
      });
    } else if (!attendance.inTime && !attendance.outTime) {
      attendance.status = isWeekend ? "Weekend" : "Absent";
      await attendance.save();
    }

    // ✅ Populate user details
    await attendance.populate(
      "userId",
      "first_name last_name email status department designation salary role"
    );

    attendanceResponse = {
      ...attendance.toObject(),
      inTime: attendance.inTime ? moment(attendance.inTime).format("YYYY-MM-DD HH:mm") : null,
      outTime: attendance.outTime ? moment(attendance.outTime).format("YYYY-MM-DD HH:mm") : null,
    };

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: `Attendance for ${dateKey} fetched successfully`,
      date: dateKey,
      attendance: attendance,
      branch: {
        name: branch.name,
        weekends: branchWeekends,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Failed to fetch attendance record",
      error: err.message,
    });
  }
};



// Get all users' attendance for today
export const getAllUsersTodayAttendance = async (req, res) => {
  try {
    // ✅ Fetch all users (active only if needed)
    const users = await userModel.find(withoutDeletedUsers())
      .populate({ path: "branch", select: "weekends timeZone branchName" })
      .lean();

    const branchIds = [...new Set(users.map(u => u.branch?._id).filter(Boolean))];
    const branchHolidayMap = await getHolidaysForBranches(branchIds);

    // ✅ Fetch all leaves (approved only)
    const leaveRecords = await LeaveModel.find({
      status: "Approved"
    }).lean();

    const leaveMap = {};
    leaveRecords.forEach(leave => {
      leaveMap[`${leave.userId}_${moment(leave.date).format("YYYY-MM-DD")}`] = leave;
    });

    const result = [];

    for (const user of users) {
      const userId = user._id.toString();
      const userTimeZone = user?.timeZone || "UTC";
      const userBranchId = user.branch?._id?.toString();

      const holidays = branchHolidayMap[userBranchId] || [];
      const branchWeekends = user?.branch?.weekends || [];

      // ✅ User ke timezone ke hisaab se aaj ka date
      const userMoment = moment().tz(userTimeZone);
      const userToday = userMoment.format("YYYY-MM-DD");
      const currentDay = userMoment.format("dddd");

      // ✅ Holiday map by user timezone
      const isHoliday = holidays.some(
        h => moment(h.date).tz(userTimeZone).format("YYYY-MM-DD") === userToday
      );
      const isWeekend = branchWeekends.includes(currentDay);

      // ✅ Fetch existing attendance for this user + date
      let att = await AttendanceModel.findOne({ userId, date: userToday }).lean();
      const leave = leaveMap[userId];

      // ✅ Build record
      let record = {
        user: {
          userId: user._id || null,
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          email: user.email || null,
          department: user.department || null,
          designation: user.designation || null,
          salary: user.salary || null,
          role: user.role || null
        },
        date: userToday,
        inTime: null,
        outTime: null,
        duration: null,
        status: "Absent"
      };

      // ✅ Status calculation
      if (isWeekend) {
        record.status = "Weekend";
      } else if (isHoliday) {
        if (att && att.inTime && att.outTime) {
          record.status = "Over Time";
          record.inTime = att.inTime || null;
          record.outTime = att.outTime || null;
          record.duration = att.duration || null;
        } else {
          record.status = "Holiday";
        }
      } else if (leave) {
        record.status = "Leave";
      } else if (att) {
        record.inTime = att.inTime || null;
        record.outTime = att.outTime || null;
        record.duration = att.duration || null;
        record.status = att.status || "Present";
      }

      // ✅ DB update / upsert attendance (date = userToday)
      await AttendanceModel.findOneAndUpdate(
        { userId, date: userToday },
        { $set: record },
        { upsert: true, new: true }
      );

      // record.inTime = record.inTime ? moment(record.inTime).format("YYYY-MM-DD HH:mm") : null;
      // record.outTime = record.outTime ? moment(record.outTime).format("YYYY-MM-DD HH:mm") : null;


      result.push(record);
    }


    res.status(200).json({
      success: true,
      statusCode: 200,
      count: result.length,
      message: "All users' attendance for today fetched successfully",
      totalUsers: result.length,
      data: result
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Failed to fetch all users' attendance for today",
      error: err.message
    });
  }
};


// Get all users' attendance by date 
export const getAllUsersAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.query; // Or req.body if POST
    const targetDate = date ? moment(date, "YYYY-MM-DD") : moment();
    const dateKey = targetDate.format("YYYY-MM-DD");

    // ✅ Fetch all users (active only)
    const users = await userModel.find(withoutDeletedUsers())
      .populate({ path: "branch", select: "weekends timeZone" })
      .lean();

    const branchIds = [...new Set(users.map(u => u.branch?._id).filter(Boolean))];

    // ✅ Fetch holidays for all branches
    const holidays = await holidayModel.find({ branch: { $in: branchIds }, isOptional: false }).lean();
    const branchHolidayMap = {};
    holidays.forEach(h => {
      const key = h.branch.toString();
      if (!branchHolidayMap[key]) branchHolidayMap[key] = [];
      branchHolidayMap[key].push(h);
    });

    // ✅ Fetch attendance & approved leaves for target date
    const [attendanceRecords, leaveRecords] = await Promise.all([
      AttendanceModel.find({ date: dateKey }).lean(),
      LeaveModel.find({ date: dateKey, status: "Approved" }).lean()
    ]);

    // ✅ Convert to maps for quick lookup
    const attendanceMap = {};
    attendanceRecords.forEach(att => {
      attendanceMap[att.userId.toString()] = att;
    });

    const leaveMap = {};
    leaveRecords.forEach(lv => {
      const key = `${lv.userId}_${moment(lv.date).format("YYYY-MM-DD")}`;
      leaveMap[key] = lv;
    });

    const result = [];
    const bulkOps = [];

    for (const user of users) {
      const userId = user._id.toString();
      const userTimeZone = user.timeZone || "UTC";
      const branchId = user.branch?._id?.toString();
      const branchWeekends = user?.branch?.weekends || [];

      const userMoment = targetDate.clone().tz(userTimeZone);
      const selectedDay = userMoment.format("dddd");
      const userDateKey = userMoment.format("YYYY-MM-DD");

      const branchHolidays = branchHolidayMap[branchId] || [];
      const isHoliday = branchHolidays.some(
        h => moment(h.date).tz(userTimeZone).format("YYYY-MM-DD") === userDateKey
      );
      const isWeekend = branchWeekends.includes(selectedDay);

      const att = attendanceMap[userId];
      const leave = leaveMap[`${userId}_${userDateKey}`];

      // ✅ Default record
      let record = {
        user: {
          userId: user._id || null,
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          email: user.email || null,
          department: user.department || null,
          designation: user.designation || null,
          salary: user.salary || null,
          role: user.role || null,
        },
        date: userDateKey,
        inTime: att?.inTime || null,
        outTime: att?.outTime || null,
        duration: att?.duration || null,
        status: "Absent",
        location: att?.location || { checkIn: {}, checkOut: {} }
      };

      // ✅ Status logic
      if (isWeekend) record.status = "Weekend";
      else if (isHoliday) record.status = att?.inTime && att?.outTime ? "Over Time" : "Holiday";
      else if (leave) record.status = "Leave";
      else if (att) record.status = att.status || "Present";

      // ✅ Prepare bulk write
      bulkOps.push({
        updateOne: {
          filter: { userId, date: userDateKey },
          update: {
            $set: {
              date: record.date,
              inTime: record.inTime,
              outTime: record.outTime,
              duration: record.duration,
              status: record.status,
              location: record.location
            }
          },
          upsert: true
        }
      });
      // console.log("before format ", record.inTime, record.outTime);
      // record.inTime = record.inTime ? moment(record.inTime).format("YYYY-MM-DD HH:mm") : null;
      // record.outTime = record.outTime ? moment(record.outTime).format("YYYY-MM-DD HH:mm") : null;
      // console.log("after format ", record.inTime, record.outTime);

      result.push(record);
    }

    if (bulkOps.length > 0) {
      await AttendanceModel.bulkWrite(bulkOps);
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      count: result.length,
      message: `All users' attendance for ${dateKey} fetched successfully`,
      date: dateKey,
      totalUsers: result.length,
      data: result
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: `Failed to fetch all users' attendance`,
      error: err.message
    });
  }
};


export const getLoginUserFullAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await userModel.findById(userId).populate("branch");
    console.log("login user ", user);

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!user.branch) return res.status(400).json({ success: false, message: "Branch not found" });

    const userTimeZone = user.timeZone || "UTC";

    // Fetch data
    const attendanceRecords = await AttendanceModel.find({ userId }).lean();
    console.log("attendanceRecords ", attendanceRecords.attendanceRecords);
    const holidayRecords = await getBranchHolidaysForUser(user);
    const leaveRecords = await LeaveModel.find({ userId, status: "Approved" }).lean();

    const fullHistory = buildFullAttendanceHistory(user, attendanceRecords, holidayRecords, leaveRecords, userTimeZone);

    const formattedHistory = fullHistory.map(rec => ({
      ...rec,
      inTime: rec.inTime ? moment(rec.inTime).format("YYYY-MM-DD HH:mm") : null,
      outTime: rec.outTime ? moment(rec.outTime).format("YYYY-MM-DD HH:mm") : null,
    }));

    res.status(200).json({
      success: true,
      count: fullHistory.length,
      message: "Full Attendance History fetched successfully",
      data: fullHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch attendance", error: error.message });
  }
};


export const getSingleUserFullAttendanceHistory = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await userModel.findById(userId).populate("branch");

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!user.branch) return res.status(400).json({ success: false, message: "Branch not found" });

    const userTimeZone = user.timeZone || "UTC";

    // Fetch data
    const attendanceRecords = await AttendanceModel.find({ userId }).lean();
    const holidayRecords = await getBranchHolidaysForUser(user);
    const leaveRecords = await LeaveModel.find({ userId, status: "Approved" }).lean();

    const fullHistory = buildFullAttendanceHistory(user, attendanceRecords, holidayRecords, leaveRecords, userTimeZone);

    const formattedHistory = fullHistory.map(rec => ({
      ...rec,
      inTime: rec.inTime ? moment(rec.inTime).format("YYYY-MM-DD HH:mm") : null,
      outTime: rec.outTime ? moment(rec.outTime).format("YYYY-MM-DD HH:mm") : null,
    }));


    res.status(200).json({
      success: true,
      count: fullHistory.length,
      message: "Full Attendance History fetched successfully",
      data: fullHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch attendance", error: error.message });
  }
};


export const getAllUsersFullAttendanceHistory = async (req, res) => {
  try {
    const users = await userModel.find(withoutDeletedUsers())
      .populate({ path: "branch", select: "weekends" })
      .lean();

    const today = moment().startOf("day");
    const result = [];

    for (const user of users) {
      const userId = user._id.toString();
      const userTimeZone = user.timeZone || "UTC";

      // ✅ Fetch bulk data for each user
      const [attendanceRecords, leaveRecords, holidayRecords] = await Promise.all([
        AttendanceModel.find({ userId }).lean(),
        LeaveModel.find({ userId, status: "Approved" }).lean(),
        getBranchHolidaysForUser(user)
      ]);

      // ✅ Build full attendance history using utility
      const fullHistory = buildFullAttendanceHistory(
        user,
        attendanceRecords,
        holidayRecords,
        leaveRecords,
        userTimeZone
      );

      // ✅ Push user object + history
      result.push({
        user: {
          userId,
          empId: user.userId,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          phone: user.phone,
          joining_date: user.joining_date,
          department: user.department,
          designation: user.designation,
          salary: user.salary,
          role: user.role
        },
        // history: fullHistory,
        attendanceDays: fullHistory.length
      });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      count: result.length,
      message: "All users' full attendance history fetched successfully",
      data: result
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching full attendance history",
      error: error.message
    });
  }
};



export const getAllUsersAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { _id } = req.user;

    const user = await userModel.findById(_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const formattedStart = moment
      .tz(startDate, user.timeZone)
      .format("YYYY-MM-DD");
    const formattedEnd = moment.tz(endDate, user.timeZone).format("YYYY-MM-DD");

    const dateRange = [];
    let curr = moment.tz(startDate, user.timeZone).startOf("day");
    const last = moment.tz(endDate, user.timeZone).endOf("day");

    while (curr.isSameOrBefore(last, "day")) {
      dateRange.push(curr.format("YYYY-MM-DD"));
      curr.add(1, "day");
    }

    const records = await AttendanceModel.find({
      date: {
        $gte: formattedStart,
        $lte: formattedEnd,
      },
    }).populate({
      path: "userId",
      select: "first_name last_name email status timeZone branch",
      populate: {
        path: "branch",
        select: "weekends",
      },
    });

    const userMap = new Map();

    records.forEach((record) => {
      const recordUser = record.userId;
      if (!recordUser?._id) return;
      const userKey = recordUser._id.toString();

      if (!userMap.has(userKey)) {
        userMap.set(userKey, {
          userId: recordUser._id,
          name: `${recordUser.first_name} ${recordUser.last_name}`,
          email: recordUser.email,
          status: recordUser.status,
          timeZone: recordUser.timeZone || "UTC",
          weekends: recordUser.branch?.weekends || ["Sunday"],
          attendance: {},
          presentCount: 0,
          absentCount: 0,
          halfDayCount: 0,
          outOfDays: 0,
        });
      }

      const formattedDate = moment(record.date).format("YYYY-MM-DD");
      const userData = userMap.get(userKey);
      userData.attendance[formattedDate] = record.status;

      if (record.status.toLowerCase() === "present") userData.presentCount++;
      if (record.status.toLowerCase() === "absent") userData.absentCount++;
      if (record.status.toLowerCase() === "half day") userData.halfDayCount++;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance Report");

    const columns = [
      { header: "User ID", key: "userId", width: 25 },
      { header: "Name", key: "name", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Status", key: "status", width: 15 },
      ...dateRange.map((date) => ({ header: date, key: date, width: 15 })),
      { header: "Total Present", key: "totalPresent", width: 15 },
      { header: "Total Absent", key: "totalAbsent", width: 15 },
      // { header: "Total Half Day", key: "totalHalfDay", width: 15 },
      { header: "Out of Days", key: "outOfDays", width: 15 },
    ];

    sheet.columns = columns;

    for (const [, user] of userMap.entries()) {
      const row = {
        userId: user.userId.toString(),
        name: user.name,
        email: user.email,
        status: user.status,
      };

      dateRange.forEach((date) => {
        const status = user.attendance[date];
        if (user.attendance[date]) {
          row[date] = user.attendance[date];
        } else {
          const dayName = moment.tz(date, user.timeZone).format("dddd");
          const isWeekend = user.weekends.includes(dayName);
          if (isWeekend) {
            row[date] = "Weekend";
          } else {
            row[date] = "Absent";
            user.absentCount++;
          }
        }
        // if (status) {
        //   row[date] = status;
        // } else {
        //   row[date] = "Absent";
        //   user.absentCount++;
        // }
      });

      row.totalPresent = user.presentCount;
      row.totalAbsent = user.absentCount;
      row.totalHalfDay = user.halfDayCount;
      row.outOfDays = dateRange.length;

      sheet.addRow(row);
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Attendance_Report_${startDate}_to_${endDate}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};


export const backFillAttendance = async (req, res) => {
  try {
    const { userId, fromDate, toDate } = req.body;

    if (!userId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "userId, fromDate and toDate are required",
      });
    }

    const start = moment(fromDate, "YYYY-MM-DD");
    const end = moment(toDate, "YYYY-MM-DD");

    if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range",
      });
    }

    const staticLocation = {
      latitude: 19.1872137,
      longitude: 77.3169113,
      address: {
        city: "Mumbai",
        county: "Mumbai",
        state_district: "Mumbai",
        state: "Maharashtra",
        postcode: "431600",
        country: "India",
        country_code: "in"
      },
      displayName: "Juhu Church Road, Juhu Market, K/W Ward, Zone 3, Mumbai, Mumbai Suburb…",
      punchedFrom: "Web"
    }

    const attendanceRecords = [];
    let skipped = 0;

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
      const day = current.format("dddd");
      const date = current.format("YYYY-MM-DD");

      if (day !== "Sunday") {
        const exists = await AttendanceModel.findOne({ userId, date });
        if (exists) {
          skipped++;
        } else {
          // Random Check-In between 8:30 AM - 9:00 AM
          const checkInMinute = 30 + Math.floor(Math.random() * 31);
          const inTime = moment(`${date} 08:${checkInMinute}`, "YYYY-MM-DD HH:mm").toDate();

          // Random Check-Out between 6:20 PM - 6:40 PM
          const checkOutMinute = 20 + Math.floor(Math.random() * 21);
          const outTime = moment(`${date} 18:${checkOutMinute}`, "YYYY-MM-DD HH:mm").toDate();

          attendanceRecords.push({
            userId,
            date,
            inTime,
            outTime,
            status: "Present",
            duration: moment.utc(outTime - inTime).format("HH:mm:ss"),
            location: {
              checkIn: staticLocation,
              checkOut: staticLocation
            }
          });
        }
      }
      current.add(1, "day");
    }

    if (attendanceRecords.length > 0) {
      await AttendanceModel.insertMany(attendanceRecords);
    }

    res.status(201).json({
      success: true,
      message: "Attendance backfill completed successfully",
      totalInserted: attendanceRecords.length,
      skipped,
      data: attendanceRecords
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const backFillAttendanceWithWeekends = async (req, res) => {
  try {
    const { userId, fromDate, toDate } = req.body;

    if (!userId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "userId, fromDate and toDate are required",
      });
    }

    const start = moment(fromDate, "YYYY-MM-DD");
    const end = moment(toDate, "YYYY-MM-DD");

    if (!start.isValid() || !end.isValid() || start.isAfter(end)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range",
      });
    }

    // ✅ Get user with branch
    const user = await userModel.findById(userId).populate("branch");
    if (!user || !user.branch) {
      return res.status(404).json({
        success: false,
        message: "User or branch not found",
      });
    }

    const branchWeekends = user.branch.weekends || []; // e.g. ["Sunday"] or ["Saturday","Sunday"]

    const staticLocation = {
      latitude: 19.1872137,
      longitude: 77.3169113,
      address: {
        city: "Mumbai",
        county: "Mumbai",
        state_district: "Mumbai",
        state: "Maharashtra",
        postcode: "431600",
        country: "India",
        country_code: "in"
      },
      displayName: "Juhu Church Road, Juhu Market, K/W Ward, Zone 3, Mumbai, Mumbai Suburb…",
      punchedFrom: "Web"
    };

    const attendanceRecords = [];
    let skipped = 0;

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
      const day = current.format("dddd"); // e.g. "Monday"
      const date = current.format("YYYY-MM-DD");

      const exists = await AttendanceModel.findOne({ userId, date });
      if (exists) {
        skipped++;
      } else {
        if (branchWeekends.includes(day)) {
          // ✅ Mark as weekend
          attendanceRecords.push({
            userId,
            date,
            status: "Weekend",
            inTime: null,
            outTime: null,
            duration: "00:00:00",
            location: {}
          });
        } else {
          // ✅ Normal Present
          const checkInMinute = 30 + Math.floor(Math.random() * 31);
          const inTime = moment(`${date} 08:${checkInMinute}`, "YYYY-MM-DD HH:mm").toDate();

          const checkOutMinute = 20 + Math.floor(Math.random() * 21);
          const outTime = moment(`${date} 18:${checkOutMinute}`, "YYYY-MM-DD HH:mm").toDate();

          attendanceRecords.push({
            userId,
            date,
            inTime,
            outTime,
            status: "Present",
            duration: moment.utc(outTime - inTime).format("HH:mm:ss"),
            location: {
              checkIn: staticLocation,
              checkOut: staticLocation
            }
          });
        }
      }
      current.add(1, "day");
    }

    if (attendanceRecords.length > 0) {
      await AttendanceModel.insertMany(attendanceRecords);
    }

    res.status(201).json({
      success: true,
      message: "Attendance backfill completed successfully",
      totalInserted: attendanceRecords.length,
      skipped,
      data: attendanceRecords
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export const migrateAttendanceWithUserData = async (req, res) => {
  try {
    // ✅ Attendance records jisme user info missing hai
    const attendances = await AttendanceModel.find({
      $or: [{ userName: { $exists: false } }, { userEmail: { $exists: false } }]
    }).populate("userId", "first_name last_name email");

    let updatedCount = 0;

    for (const att of attendances) {
      if (att.userId) {
        att.userName = `${att.userId.first_name} ${att.userId.last_name}`;
        att.userEmail = att.userId.email;
        await att.save();
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: "Attendance records updated with user info",
      updatedCount
    });
  } catch (error) {
    console.error("Migration Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating attendance with user info",
      error: error.message
    });
  }
};


export const findInvalidAttendanceStatus = async () => {
  try {
    const validStatuses = ['Present', 'Absent', 'Leave', 'Half Day', 'Weekend', 'Over Time', 'Holiday'];

    // Invalid status wale attendance records fetch karte hain
    const invalidRecords = await AttendanceModel.find({
      $or: [
        { status: { $exists: false } },
        { status: { $eq: "" } },
        { status: { $nin: validStatuses } },
      ],
    }).populate("userId", "first_name last_name email");

    console.log("Invalid Attendance Records:", invalidRecords.length);
    invalidRecords.forEach(att => {
      console.log({
        _id: att._id,
        userId: att.userId?._id,
        status: att.status,
        date: att.date
      });
    });

    return invalidRecords;
  } catch (err) {
    console.error(err);
    return [];
  }
};
