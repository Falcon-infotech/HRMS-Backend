import express from 'express';
import {  backFillAttendance, backFillAttendanceWithWeekends, findInvalidAttendanceStatus, getAllUsersAttendanceByDate, getAllUsersAttendanceReport, getAllUsersFullAttendanceHistory, getAllUsersTodayAttendance, getLoginUserFullAttendanceHistory, getSingleUserAttendanceByDate, getSingleUserFullAttendanceHistory, getTodayAttendance, markInTime, markOutTime, migrateAttendanceWithUserData } from '../controllers/attendanceController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';
import { getSearchAttendanceUsers } from '../controllers/searchController.js';


const attendanceRouter = express.Router();

attendanceRouter.post('/check_in', authenticate, authorizeRoles('admin', 'hr', 'employee'), markInTime);
attendanceRouter.post('/check_out', authenticate, authorizeRoles('admin', 'hr', 'employee'), markOutTime);

// attendanceRouter.get('/migrateAttendanceWithUserData', migrateAttendanceWithUserData);
// attendanceRouter.get('/findInvalidAttendanceStatus', findInvalidAttendanceStatus);
attendanceRouter.get('/search', getSearchAttendanceUsers);

attendanceRouter.get('/single_user_today_attendance', authenticate, authorizeRoles('admin', 'hr', 'employee'), getTodayAttendance);
attendanceRouter.get('/single_user_attendance_by_date', authenticate, authorizeRoles('admin', 'hr', 'employee'), getSingleUserAttendanceByDate);
attendanceRouter.get('/login_user_attendance_history', authenticate, authorizeRoles('admin', 'hr', 'employee'), getLoginUserFullAttendanceHistory);
attendanceRouter.get('/single_user_attendance_history/:id', authenticate, authorizeRoles('admin', 'hr', 'employee'), getSingleUserFullAttendanceHistory);

attendanceRouter.get('/all_users_today_attendance', authenticate, authorizeRoles('admin', 'hr'), getAllUsersTodayAttendance);
attendanceRouter.get('/all_users_attendance_by_date', authenticate, authorizeRoles('admin', 'hr'), getAllUsersAttendanceByDate);
attendanceRouter.get('/all_user_attendance_history', authenticate, authorizeRoles('admin', 'hr'), getAllUsersFullAttendanceHistory);


attendanceRouter.get('/all_user_attendance_report', authenticate, authorizeRoles('admin', 'hr'), getAllUsersAttendanceReport);
// attendanceRouter.get('/migrate_string_dates', authenticate, authorizeRoles('admin', 'hr'), migrateStringDatesToDateType);
attendanceRouter.post('/backfillAttendance', backFillAttendanceWithWeekends);

export default attendanceRouter;
