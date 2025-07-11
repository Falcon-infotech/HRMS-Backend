// leaveRoutes.js
import express from 'express';
import {
  applyLeave,
  getAllLeavesStatus,
  getAllUsersLeaveReport,
  getLeavesByUserId,
  getLoginUserAllLeaves,
  updateLeaveStatus,
} from '../controllers/leaveController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const leaveRouter = express.Router();

leaveRouter.post('/apply_leave', authenticate,  authorizeRoles('admin', 'hr', 'employee'), applyLeave);
leaveRouter.get('/my_leaves', authenticate,  authorizeRoles('admin', 'hr', 'employee'), getLoginUserAllLeaves);

leaveRouter.get('/', authenticate,  authorizeRoles('admin', 'hr'), getAllLeavesStatus);
leaveRouter.get('/leaves_byId/:id', authenticate,  authorizeRoles('admin', 'hr'), getLeavesByUserId);
leaveRouter.put('/update_leave/:id', authenticate,  authorizeRoles('admin', 'hr'), updateLeaveStatus);

leaveRouter.get('/all_user_leave_report', authenticate,  authorizeRoles('admin', 'hr'), getAllUsersLeaveReport);

export default leaveRouter;