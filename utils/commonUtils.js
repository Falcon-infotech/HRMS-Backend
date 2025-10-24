import AttendanceModel from "../models/attendanceModule.js";
import branchModel from "../models/branchModel.js";
import holidayModel from "../models/holidayModule.js";
import mongoose from "mongoose";
import LeaveModel from "../models/leaveModel.js";
import moment from "moment-timezone";

export const buildFullAttendanceHistory = (user, attendanceRecords, holidayRecords, leaveRecords, userTimeZone) => {
  const branchWeekends = user.branch?.weekends || [];
  const joiningDate = moment(user.joining_date).tz(userTimeZone).startOf("day");
  const today = moment().tz(userTimeZone).startOf("day");

  // Maps for quick lookup
  const attendanceMap = {};
  attendanceRecords.forEach(att => {
    const attDateKey = moment(att.date).tz(userTimeZone).format("YYYY-MM-DD");
    attendanceMap[attDateKey] = att;
  });

  const holidayMap = {};
  holidayRecords.forEach(holiday => {
    const key = moment(holiday.date).tz(userTimeZone).format("YYYY-MM-DD");
    holidayMap[key] = holiday;
  });

  const leaveMap = {};
  leaveRecords.forEach(leave => {
    const key = moment(leave.date).tz(userTimeZone).format("YYYY-MM-DD");
    leaveMap[key] = leave;
  });

  // Build history
  const fullHistory = [];
  let current = joiningDate.clone();

  while (current.isSameOrBefore(today)) {
    const dateKey = current.format("YYYY-MM-DD");
    const currentDay = current.format("dddd");

    let record = {
      date: dateKey,
      status: "Absent",
      inTime: null,
      outTime: null,
      duration: null,
      leaveType: null,
      userTimeZone: userTimeZone,
      location: { checkIn: {}, checkOut: {} }
    };

    if (attendanceMap[dateKey]) {
      record = { ...record, ...attendanceMap[dateKey] };

      if (holidayMap[dateKey]) {
        if (record.inTime && record.outTime) record.status = "Present";
        else record.status = "Holiday";
      }
    } else if (leaveMap[dateKey]) {
      record.status = "Leave";
      record.leaveType = leaveMap[dateKey].leaveType;
    } else if (holidayMap[dateKey]) {
      if (record.inTime && record.outTime) record.status = "Present";
      else record.status = "Holiday";
    } else if (branchWeekends.includes(currentDay)) {
      record.status = "Weekend";
    }

    fullHistory.push(record);
    // fullHistory.push(record.userTimeZone);
    current.add(1, "day");
  }

  return fullHistory;
};


export const getBranchHolidaysForUser = async (user) => {
  try {
    let branchId;

    if (!user.branch) {
      throw new Error("User does not have a branch assigned");
    }

    // ✅ If branch is populated object
    if (typeof user.branch === "object" && user.branch._id) {
      branchId = user.branch._id;
    } 
    // ✅ If branch is string (ObjectId or branch name)
    else if (typeof user.branch === "string") {
      const isValidObjectId = mongoose.Types.ObjectId.isValid(user.branch);

      const branch = await branchModel.findOne(
        isValidObjectId
          ? { _id: user.branch }
          : { branchName: { $regex: `^${user.branch.trim()}$`, $options: "i" } }
      );

      if (!branch) {
        throw new Error(`Branch not found for ${user.branch}`);
      }

      branchId = branch._id;
    } 
    else {
      throw new Error("Invalid branch format in user data");
    }

    // ✅ Fetch holidays for this branch
    const holidays = await holidayModel.find({
      branch: branchId,
      isOptional: false
    }).lean();

    return holidays;
  } catch (error) {
    console.error("Error in getBranchHolidaysForUser:", error.message);
    return [];
  }
};

export const getHolidaysForBranches = async (branchIds) => {
  const holidays = await holidayModel.find({
    branch: { $in: branchIds },
    isOptional: false
  }).lean();

  // Map: branchId -> holidays[]
  const holidayMap = {};
  holidays.forEach(h => {
    const bId = h.branch.toString();
    if (!holidayMap[bId]) holidayMap[bId] = [];
    holidayMap[bId].push(h);
  });

  return holidayMap;
};

export const skipEmails = ["faisalad@gmail.com", "dummy@gmail.com",'faisalem@gmail.com','faisalem13@gmail.com','faisalem14@gmail.com','faisalem15@gmail.com',"fmslhr@gmail.com","fmslhr1@gmail.com","fmslhr2@gmail.com","fmslhr3@gmail.com","super@gmail.com",'faisalem13@gnail.com','clinton@gmail.com','ajay@falconmsl.com','faisal2@falconmsl.com','faisal@falconmsl.com'];


export const withoutDeletedUsers = (baseFilter = {}) => ({
  ...baseFilter,
  isDeleted: false,
});


export const updateHalfDayToPresent = async (req, res) => {
  try {
    const result = await AttendanceModel.updateMany(
      { status: "Half Day" },         // filter
      { $set: { status: "Present" } } // update
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: `${result.modifiedCount} records updated from Half day to Present`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Something went wrong",
      error: error.message
    });
  }
};

export const calculateLeaveBalance = async (employeeId) => {
  const existingLeaves = await LeaveModel.find({
    employee: employeeId,
    status: "approved",
    leaveType: { $in: ["casual", "vacation", "firstHalf", "secondHalf"] },
  });

  const totalLeaveTaken = existingLeaves.reduce(
    (acc, l) => acc + l.leaveTaken,
    0
  );

  return 14 - totalLeaveTaken;
};



export const fixInvalidLocationDocs = async () => {
  try {
    // Find all docs where location exists but is not an object
    const invalidDocs = await AttendanceModel.find({
      location: { $exists: true, $not: { $type: "object" } }
    });

    if (!invalidDocs.length) {
      console.log("✅ No invalid documents found. All good!");
      return;
    }

    console.log(`⚠️ Found ${invalidDocs.length} invalid documents. Fixing...`);

    // Update all invalid docs in one go
    const result = await AttendanceModel.updateMany(
      { location: { $exists: true, $not: { $type: "object" } } },
      { $set: { location: { checkIn: {}, checkOut: {} } } }
    );

    console.log(`✅ Fixed ${result.modifiedCount} documents.`);
  } catch (error) {
    console.error("❌ Error while fixing invalid documents:", error);
  }
};