import AttendanceModel from "../models/attendanceModule.js";
import LeaveModel from "../models/leaveModel.js";
import userModel from "../models/userModel.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";

import moment from "moment-timezone";
import { sendNotification } from "../utils/notificationutils.js";
import { calculateLeaveBalance } from "../utils/commonUtils.js";

export const applyLeave = async (req, res) => {
  try {
    const { leaveType, fromDate, toDate, reason } = req.body;
    const userId = req.user?._id;
    const user = await userModel.findById(userId);
    const userTimeZone = user.timeZone || "UTC";

    // ✅ Convert user local date → UTC start & end
    const start = moment.tz(fromDate, "YYYY-MM-DD", userTimeZone).startOf("day").utc().toDate();
    const end = moment.tz(toDate, "YYYY-MM-DD", userTimeZone).endOf("day").utc().toDate();

    let leaveBalance = await calculateLeaveBalance(userId);
    const sickLeaveCount = await LeaveModel.countDocuments({
      employee: userId,
      status: "approved",
      leaveType: "sick",
    });

    const unpaidLeaveCount = await LeaveModel.countDocuments({
      employee: userId,
      status: "approved",
      leaveType: "unpaid",
    });

    const leaveDays =
      Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const isCasualOrVacation = ["casual", "vacation"].includes(leaveType);
    const isHalfDay = ["firstHalf", "secondHalf"].includes(leaveType);
    const deduction = isHalfDay ? 0.5 : leaveDays;

    if ((isCasualOrVacation || isHalfDay) && leaveBalance < deduction) {
      return res.status(400).json({
        success: false,
        message: "Insufficient leave balance",
      });
    }

    // ✅ Check overlap using UTC dates
    const overlappingLeave = await LeaveModel.findOne({
      employee: userId,
      status: "approved",
      fromDate: { $lte: end },
      toDate: { $gte: start },
    });

    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: "Leave already approved in the selected date range",
      });
    }

    const leave = await LeaveModel.create({
      employee: userId,
      userId,
      leaveType,
      fromDate: start, // ✅ Store UTC
      toDate: end,     // ✅ Store UTC
      reason,
      sickLeave: sickLeaveCount,
      unPaidLeave: unpaidLeaveCount,
      leaveBalance,
      leaveTaken: deduction,
      maximumLeave: 14,
      status: "pending",
    });

    await sendNotification({
      forRoles: ["admin", "hr"],
      title: "New Leave Request",
      message: `${user.first_name} ${user.last_name} requested leave from ${fromDate} to ${toDate}`,
      link: `/leave`,
      type: "user",
      performedBy: user._id,
    });

    await sendNotification({
      userId: user._id,
      title: "Leave Request Submitted",
      message: `Your leave request from ${fromDate} to ${toDate} has been submitted.`,
      link: `/leavestatus`,
      type: "user",
    });

    res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to apply leave",
      error: error.message,
    });
  }
};


export const updateLeaveStatus = async (req, res) => {
  try {
    const leaveId = req.params.id;
    const { status } = req.body;
    const userId = req.user._id;
    const loginUser = await userModel.findById(userId);

    if (!["approved", "rejected", "cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const leave = await LeaveModel.findById(leaveId);
    if (!leave) {
      return res.status(404).json({ success: false, message: "Leave not found" });
    }

    const user = await userModel.findById(leave.employee);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let leaveBalance = await calculateLeaveBalance(user._id);

    // ✅ Approval flow
    if (status === "approved" && leave.status !== "approved") {
      const todayUTC = moment.utc().startOf("day").toDate();
      if (leave.toDate < todayUTC) {
        return res.status(400).json({
          success: false,
          message: "Cannot approve leave for past dates",
        });
      }

      // Attendance marking (convert each day → UTC based string)
      const dates = [];
      let cursor = moment.utc(leave.fromDate);
      while (cursor.isSameOrBefore(moment.utc(leave.toDate))) {
        dates.push(cursor.format("YYYY-MM-DD"));
        cursor.add(1, "day");
      }

      let operations;
      if (["firstHalf", "secondHalf"].includes(leave.leaveType)) {
        const leaveLabel = leave.leaveType === "firstHalf" ? "First Half Leave" : "Second Half Leave";
        operations = dates.map((date) => ({
          updateOne: {
            filter: { date, userId: leave.employee },
            update: { $set: { status: leaveLabel } },
            upsert: true,
          },
        }));
        leave.leaveTaken = 0.5;
        leave.leaveBalance = leaveBalance - 0.5;
      } else {
        operations = dates.map((date) => ({
          updateOne: {
            filter: { date, userId: leave.employee },
            update: { $set: { status: "Leave" } },
            upsert: true,
          },
        }));
        if (["casual", "vacation"].includes(leave.leaveType)) {
          leave.leaveBalance = leaveBalance - leave.leaveTaken;
        } else if (leave.leaveType === "sick") {
          user.sickLeaves = (user.sickLeaves || 0) + leave.leaveTaken;
          leave.sickLeave = user.sickLeaves;
        } else if (["LOP", "unpaid"].includes(leave.leaveType)) {
          user.unpaidLeaves = (user.unpaidLeaves || 0) + leave.leaveTaken;
          leave.unPaidLeave = user.unpaidLeaves;
        }
      }

      await AttendanceModel.bulkWrite(operations);
    }

    // ✅ Cancel flow
    if (leave.status === "approved" && status === "cancelled") {
      const dates = [];
      let cursor = moment.utc(leave.fromDate);
      while (cursor.isSameOrBefore(moment.utc(leave.toDate))) {
        dates.push(cursor.format("YYYY-MM-DD"));
        cursor.add(1, "day");
      }

      await Promise.all(
        dates.map((date) =>
          AttendanceModel.updateOne(
            { date, userId: leave.employee },
            { $set: { status: "" } }
          )
        )
      );

      const deduction = ["firstHalf", "secondHalf"].includes(leave.leaveType) ? 0.5 : leave.leaveTaken;
      if (["casual", "vacation"].includes(leave.leaveType)) {
        leave.leaveBalance += deduction;
      } else if (leave.leaveType === "sick") {
        user.sickLeaves = (user.sickLeaves || 0) - deduction;
        leave.sickLeave = user.sickLeaves;
      } else if (["LOP", "unpaid"].includes(leave.leaveType)) {
        user.unpaidLeaves = (user.unpaidLeaves || 0) - deduction;
        leave.unPaidLeave = user.unpaidLeaves;
      }
    }

    leave.status = status;
    await user.save();
    await leave.save();

    res.status(200).json({
      success: true,
      message: `Leave ${status} successfully`,
      leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update leave status",
      error: error.message,
    });
  }
};


export const cancelLeaveByUser = async (req, res) => {
  try {
    const leaveId = req.params.leaveId;
    const userId = req.user._id;

    // Get leave
    const leave = await LeaveModel.findById(leaveId);
    if (!leave) {
      return res.status(404).json({ success: false, message: "Leave not found" });
    }

    // Check if leave belongs to this user
    if (leave.employee.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can cancel only your own leaves" });
    }

    // ✅ User timezone pick karo (default UTC agar missing ho)
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const userTimeZone = user.timeZone || "UTC";

    // ✅ Today user ke timezone ke hisab se nikalo
    const today = moment().tz(userTimeZone).startOf("day");

    // ✅ Deadline = fromDate - 1 day (user timezone ke hisab se)
    const cancelDeadline = moment(leave.fromDate).tz(userTimeZone).subtract(1, "day").endOf("day");

    if (today.isAfter(cancelDeadline)) {
      return res.status(400).json({
        success: false,
        message: "You can cancel leave only till one day before it starts",
      });
    }

    const isHalfDay = leave.leaveType === "firstHalf" || leave.leaveType === "secondHalf";

    // ✅ Attendance reset karna
    const dates = [];
    for (
      let date = moment(leave.fromDate);
      date.isSameOrBefore(leave.toDate);
      date.add(1, "days")
    ) {
      dates.push(date.format("YYYY-MM-DD"));
    }

    await Promise.all(
      dates.map((date) =>
        AttendanceModel.updateOne(
          {
            date,
            userId: leave.employee,
            status: isHalfDay
              ? { $in: ["First Half Leave", "Second Half Leave"] }
              : "Leave",
          },
          { $set: { status: "" } }
        )
      )
    );

    // ✅ Balance reversal
    if (["casual", "vacation", "firstHalf", "secondHalf"].includes(leave.leaveType)) {
      const updatedBalance = await calculateLeaveBalance(userId);
      user.leaveBalance = updatedBalance;
      leave.leaveBalance = updatedBalance;
    } else if (leave.leaveType === "sick") {
      user.sickLeaves = Math.max(
        0,
        (user.sickLeaves || 0) - (isHalfDay ? 0.5 : leave.leaveTaken)
      );
      leave.sickLeave = user.sickLeaves;
    } else if (["LOP", "unpaid"].includes(leave.leaveType)) {
      user.unpaidLeaves = Math.max(
        0,
        (user.unpaidLeaves || 0) - (isHalfDay ? 0.5 : leave.leaveTaken)
      );
      leave.unPaidLeave = user.unpaidLeaves;
    }

    // ✅ Update status
    leave.status = "cancelled by user";

    await user.save();
    await leave.save();

    await sendNotification({
      forRoles: ["admin", "hr"],
      title: "Leave Cancelled",
      message: `${user.first_name} ${user.last_name} cancelled their leave from ${leave.fromDate} to ${leave.toDate}`,
      link: `/leave`,
      type: "user",
      performedBy: user._id,
    });

    res.status(200).json({
      success: true,
      message: "Leave cancelled successfully",
      data: leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to cancel leave",
      error: error.message,
    });
  }
};


export const getAllLeavesStatus = async (req, res) => {
  try {
    // ✅ Optional filters from query
    const { fromDate, toDate } = req.query;
    const userTimeZone = req.user?.timeZone || "UTC";

    let query = {};
    if (fromDate && toDate) {
      // Convert incoming dates from user TZ → UTC for DB query
      const start = moment.tz(fromDate, "YYYY-MM-DD", userTimeZone).startOf("day").utc().toDate();
      const end = moment.tz(toDate, "YYYY-MM-DD", userTimeZone).endOf("day").utc().toDate();
      query = {
        $or: [
          { fromDate: { $gte: start, $lte: end } },
          { toDate: { $gte: start, $lte: end } },
        ],
      };
    }

    const leaves = await LeaveModel.find(query)
      .populate({
        path: "employee",
        select: "first_name last_name email",
        match: { isDeleted: false },
      })
      .sort({ createdAt: -1 })
      .lean();

    const filteredLeaves = leaves.filter((leave) => leave.employee !== null);

    if (!filteredLeaves || filteredLeaves.length === 0) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "No leaves found for active users.",
      });
    }

    // ✅ Convert back UTC → user TZ for response
    const leavesWithTZ = filteredLeaves.map((leave) => ({
      ...leave,
      fromDate: moment.utc(leave.fromDate).tz(userTimeZone).format("YYYY-MM-DD"),
      toDate: moment.utc(leave.toDate).tz(userTimeZone).format("YYYY-MM-DD"),
      createdAt: moment.utc(leave.createdAt).tz(userTimeZone).format("YYYY-MM-DD HH:mm:ss"),
    }));

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leaves fetched successfully.",
      count: leavesWithTZ.length,
      data: leavesWithTZ,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal Server Error. Failed to fetch leaves.",
      error: error.message,
    });
  }
};


export const getLeavesByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    const userTimeZone = req.user?.timeZone || "UTC";

    // ✅ Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "Invalid user ID.",
      });
    }

    const leaves = await LeaveModel.find({ employee: userId })
      .populate("employee", "first_name last_name email")
      .sort({ createdAt: -1 })
      .lean();

    if (!leaves || leaves.length === 0) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "No leaves found for this user.",
      });
    }

    // ✅ Convert UTC → User timezone before sending response
    const leavesWithTZ = leaves.map((leave) => ({
      ...leave,
      fromDate: moment.utc(leave.fromDate).tz(userTimeZone).format("YYYY-MM-DD"),
      toDate: moment.utc(leave.toDate).tz(userTimeZone).format("YYYY-MM-DD"),
      createdAt: moment.utc(leave.createdAt).tz(userTimeZone).format("YYYY-MM-DD HH:mm:ss"),
    }));

    res.status(200).json({
      success: true,
      statusCode: 200,
      count: leavesWithTZ.length,
      message: "Leaves fetched successfully.",
      data: leavesWithTZ,
    });
  } catch (error) {
    console.error("Error in getLeavesByUserId:", error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal Server Error. Failed to fetch leaves by user ID.",
      error: error.message,
    });
  }
};


export const getLoginUserAllLeaves = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    if (!req.user || !req.user?._id) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: "User not authenticated",
      });
    }

    const userId = req.user._id;
    const userTimeZone = req.user?.timeZone || "UTC"; // ✅ User timezone
    const totalLeavesAllowed = 14;

    const leaves = await LeaveModel.find({ employee: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // ✅ Used leaves count (only approved)
    const usedLeaves = leaves
      .filter((leave) => leave.status === "approved")
      .reduce((acc, leave) => acc + leave.leaveTaken, 0);

    const leaveBalance = totalLeavesAllowed - usedLeaves;

    // ✅ Convert dates to user's timezone
    const updatedLeaves = leaves.map((leave) => ({
      ...leave,
      fromDate: moment.utc(leave.fromDate).tz(userTimeZone).format("YYYY-MM-DD"),
      toDate: moment.utc(leave.toDate).tz(userTimeZone).format("YYYY-MM-DD"),
      createdAt: moment.utc(leave.createdAt).tz(userTimeZone).format("YYYY-MM-DD HH:mm:ss"),
      leaveBalance, // same balance for reference
    }));

    res.status(200).json({
      success: true,
      statusCode: 200,
      message:
        leaves.length > 0
          ? "Leaves fetched successfully."
          : "No leaves found for this user.",
      count: leaves.length,
      leaveBalance,
      data: updatedLeaves,
    });
  } catch (error) {
    console.error("Error in getLoginUserAllLeaves:", error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Internal Server Error. Failed to fetch user's leaves.",
      error: error.message,
    });
  }
};


export const getAllUsersLeaveReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { _id } = req.user;

    const user = await userModel.findById(_id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const formattedStart = moment.tz(startDate, user.timeZone).startOf("day").utc().toDate();
    const formattedEnd = moment.tz(endDate, user.timeZone).endOf("day").utc().toDate();

    const leaves = await LeaveModel.find({
      fromDate: { $lte: formattedEnd },
      toDate: { $gte: formattedStart },
    }).populate("userId");

    const leaveMap = new Map();

    leaves.forEach((leave) => {
      const recordUser = leave.userId;
      if (!recordUser?._id) return;

      const userKey = recordUser._id.toString();

      if (!leaveMap.has(userKey)) {
        leaveMap.set(userKey, {
          name: `${recordUser.first_name} ${recordUser.last_name}`,
          email: recordUser.email,
          status: recordUser.status,
          sickLeave: 0,
          unPaidLeave: 0,
          leaveBalance: leave.leaveBalance || 0,
          leaves: [],
          timeZone: recordUser.timeZone || "UTC", // ✅ store user timezone
        });
      }

      const totalDays = moment(leave.toDate).diff(moment(leave.fromDate), "days") + 1;

      leaveMap.get(userKey).sickLeave += leave.sickLeave || 0;
      leaveMap.get(userKey).unPaidLeave += leave.unPaidLeave || 0;

      const userTZ = leaveMap.get(userKey).timeZone;

      leaveMap.get(userKey).leaves.push({
        reason: leave.reason,
        fromDate: moment.utc(leave.fromDate).tz(userTZ).format("YYYY-MM-DD"),
        toDate: moment.utc(leave.toDate).tz(userTZ).format("YYYY-MM-DD"),
        leaveType: leave.leaveType,
        status: leave.status,
        appliedAt: moment.utc(leave.appliedAt).tz(userTZ).format("YYYY-MM-DD"),
        totalDays,
      });
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Leave Report");

    sheet.columns = [
      { header: "Name", key: "name", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Status", key: "status", width: 15 },
      { header: "Leave Type", key: "leaveType", width: 15 },
      { header: "Reason", key: "reason", width: 30 },
      { header: "From Date", key: "fromDate", width: 15 },
      { header: "To Date", key: "toDate", width: 15 },
      { header: "Total Days", key: "totalDays", width: 15 },
      { header: "Leave Status", key: "leaveStatus", width: 15 },
      { header: "Applied At", key: "appliedAt", width: 20 },
      { header: "Sick Leave Taken", key: "sickLeave", width: 15 },
      { header: "Unpaid Leave Taken", key: "unPaidLeave", width: 15 },
      { header: "Leave Balance", key: "leaveBalance", width: 15 },
    ];

    for (const [, user] of leaveMap.entries()) {
      user.leaves.forEach((lv) => {
        sheet.addRow({
          name: user.name,
          email: user.email,
          status: user.status,
          leaveType: lv.leaveType,
          reason: lv.reason,
          fromDate: lv.fromDate,
          toDate: lv.toDate,
          totalDays: lv.totalDays,
          leaveStatus: lv.status,
          appliedAt: lv.appliedAt,
          sickLeave: user.sickLeave,
          unPaidLeave: user.unPaidLeave,
          leaveBalance: user.leaveBalance,
        });
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Leave_Report_${startDate}_to_${endDate}.xlsx`
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
