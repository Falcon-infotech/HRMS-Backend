import DailyReportModel from "../models/dailyReportModel.js";

import mongoose from "mongoose";


export const addDailyReport = async (req, res) => {
  try {
    const { date, taskGiven, taskGivenBy, concernedDepartment, objective, remark, status } = req.body;

    if (!date || !taskGiven || !taskGivenBy || !concernedDepartment || !objective) {
      return res.status(400).json({
        success: false,
        message: "date, taskGiven, taskGivenBy, concernedDepartment, and objective are required"
      });
    }

    const reportDate = new Date(date).setHours(0, 0, 0, 0); // Normalize to start of day

    // Check if report for this date already exists for this user
    let dailyReport = await DailyReportModel.findOne({
      userId: req.user._id,
      date: reportDate
    });

    if (dailyReport) {
      // Add new task in existing report
      dailyReport.reports.push({
        taskGiven,
        taskGivenBy,
        concernedDepartment,
        objective,
        remark,
        status
      });
      await dailyReport.save();

      return res.status(200).json({
        success: true,
        message: "Task added to existing daily report",
        dailyReport
      });
    } else {
      // Create new daily report document
      dailyReport = await DailyReportModel.create({
        userId: req.user._id,
        date: reportDate,
        reports: [{
          taskGiven,
          taskGivenBy,
          concernedDepartment,
          objective,
          remark,
          status
        }]
      });

      return res.status(201).json({
        success: true,
        message: "New daily report created",
        dailyReport
      });
    }

  } catch (error) {
    console.error("Error adding daily report:", error);
    res.status(500).json({
      success: false,
      message: "Server error while adding daily report",
      error: error.message
    });
  }
};


export const getAllReports = async (req, res) => {
  try {

    const { userId, fromDate, toDate, department, status, page = 1 } = req.query;
    const limit = 15;
    const skip = (page - 1) * limit;

    let filter = {};
    if (userId) filter.userId = userId;
    if (fromDate && toDate) {
      filter.date = {
        $gte: new Date(fromDate).setHours(0, 0, 0, 0),
        $lte: new Date(toDate).setHours(23, 59, 59, 999)
      };
    }

    const reports = await DailyReportModel.find(filter)
      .populate("userId", "name email role")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    // If department or status filter is applied, filter nested tasks
    let filteredReports = reports;
    if (department || status) {
      filteredReports = reports.map(report => {
        const filteredTasks = report.reports.filter(task =>
          (!department || task.concernedDepartment === department) &&
          (!status || task.status === status)
        );
        return { ...report._doc, reports: filteredTasks };
      }).filter(r => r.reports.length > 0);
    }

    const totalCount = await DailyReportModel.countDocuments(filter);

    res.status(200).json({
      success: true,
      totalReports: totalCount,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      reports: filteredReports
    });

  } catch (error) {
    console.error("Error fetching all reports:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching reports",
      error: error.message
    });
  }
};


export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await DailyReportModel.findById(id).populate("userId", "name email role");
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    res.status(200).json({
      success: true,
      report
    });

  } catch (error) {
    console.error("Error fetching report by ID:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching report",
      error: error.message
    });
  }
};


export const updateTaskStatus = async (req, res) => {
  try {
    const { reportId, taskId } = req.params;
    const { status } = req.body;

    if (!status || !["Pending", "In Progress", "Completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: Pending, In Progress, Completed"
      });
    }

    // Find the report and update the specific task
    const report = await DailyReportModel.findOneAndUpdate(
      { _id: reportId, "reports._id": taskId },
      { $set: { "reports.$.status": status } },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report or task not found"
      });
    }

    // Check permission after finding the report
    if (report.userId.toString() !== req.user._id.toString() && req.user.role === "Employee") {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this task status"
      });
    }

    res.status(200).json({
      success: true,
      message: "Task status updated successfully",
      report
    });

  } catch (error) {
    console.error("Error updating task status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating task status",
      error: error.message
    });
  }
};


export const updateDailyReport = async (req, res) => {
  try {
    const { reportId, taskId } = req.params;
    const { taskGiven, taskGivenBy, concernedDepartment, objective, remark } = req.body;


    // Find and update the specific task in the report

    const report = await DailyReportModel.findOneAndUpdate(
      { _id: reportId, "reports._id": taskId },
      {
        $set: {
          "reports.$.taskGiven": taskGiven,
          "reports.$.taskGivenBy": taskGivenBy,
          "reports.$.concernedDepartment": concernedDepartment,
          "reports.$.objective": objective,
          "reports.$.remark": remark
        }
      },
      { new: true }
    );


    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report or Task not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Report updated successfully",
      report
    });

  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating report",
      error: error.message
    });
  }
};


export const getMyReports = async (req, res) => {
  try {

    const { page = 1 } = req.query;
    const limit = 15;
    const skip = (page - 1) * limit;

    const [reports, totalCount] = await Promise.all([
      DailyReportModel.find({ userId: req.user._id })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      DailyReportModel.countDocuments({ userId: req.user._id })
    ]);

    res.status(200).json({
      success: true,
      message: "Fetched your reports successfully",
      totalReports: totalCount,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      reports
    });

  } catch (error) {
    console.error("Error fetching user reports:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching your reports",
      error: error.message
    });
  }
};


export const getSingleUserReports = async (req, res) => {
  try {

    const { page = 1 } = req.query;
    const limit = 15;
    const skip = (page - 1) * limit;

    const [reports, totalCount] = await Promise.all([
      DailyReportModel.find({ userId: req.params.userId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      DailyReportModel.countDocuments({ userId: req.params.userId })
    ]);

    res.status(200).json({
      success: true,
      message: "User reports fetched successfully",
      totalReports: totalCount,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      reports
    });

  } catch (error) {
    console.error("Error fetching user reports:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching your reports",
      error: error.message
    });
  }
};


export const deleteDailyReportTask = async (req, res) => {
  try {
    const { reportId, taskIndex } = req.params;

    const report = await DailyReportModel.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    // Check permission
    if (report.userId.toString() !== req.user._id.toString() && req.user.role === "Employee") {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this task"
      });
    }

    if (!report.reports[taskIndex]) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }

    // Remove the task
    report.reports.splice(taskIndex, 1);

    if (report.reports.length === 0) {
      await DailyReportModel.findByIdAndDelete(reportId);
      return res.status(200).json({
        success: true,
        message: "Last task deleted, daily report removed completely"
      });
    } else {
      await report.save();
    }

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      report
    });

  } catch (error) {
    console.error("Error deleting daily report task:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting task",
      error: error.message
    });
  }
};