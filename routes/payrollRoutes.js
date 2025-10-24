import express from 'express';
import multer from "multer";
import { storage } from "../config/cloudinary.config.js";
import { authenticate, authorizeRoles } from '../middleware/auth.js';
import { addPayrollBasicInfo, exportAllUsersToExcel, fetchPayrollDataFromExcel, getLastPayrollByUserId, getPayrollsByMonthAndYear, getSalarySlipById, getSinglePayrollsById, sendUserDataToExcel, updatePayrollBasicInfo } from '../controllers/payrollController.js';

const payrollRouter = express.Router();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
});


payrollRouter.use(authenticate);

payrollRouter.post('/fetch_payroll_from_excel', authorizeRoles('admin', 'hr'), upload.single('file'), fetchPayrollDataFromExcel);
payrollRouter.post('/add_payroll_basic_info/:id', authorizeRoles('admin', 'hr'), addPayrollBasicInfo);
payrollRouter.put('/update_payroll_basic_info/:id', authorizeRoles('admin', 'hr'), updatePayrollBasicInfo);
payrollRouter.get('/last/:userId', getLastPayrollByUserId);

payrollRouter.get('/get_singleUser_payroll_data/:id', authorizeRoles('admin', 'hr', 'employee'), getSinglePayrollsById);
payrollRouter.get('/get_payroll_data', authorizeRoles('admin', 'hr'), getPayrollsByMonthAndYear);
payrollRouter.get('/get_salary_slip/:id', authorizeRoles('admin', 'hr','employee'), getSalarySlipById);




payrollRouter.post('/load_all_User_To_Excel', authorizeRoles('admin', 'hr', 'employee'),exportAllUsersToExcel );
payrollRouter.post('/:id', authorizeRoles('admin', 'hr', 'employee'),sendUserDataToExcel );
// payrollRouter.get('/:id', authorizeRoles('admin', 'hr', 'employee'),getExcelDataById );


export default payrollRouter;