import mongoose from 'mongoose';

const PayrollSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',

  },
  User: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',

  },
  modifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',

  },
  month: { 
    type: String, 
    required: false, 
    enum: [
      'January', 'February', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'
    ] 
  },
  year: { 
    type: Number, 
    required: false, 
    min: 2000 
  },

  present: { type: Number, default: 0, min: 0 },
  absent: { type: Number, default: 0, min: 0 },
  halfDay: { type: Number, default: 0, min: 0 },
  unpaid: { type: Number, default: 0, min: 0 },
  sick: { type: Number, default: 0, min: 0 },
  overtime: { type: Number, default: 0, min: 0 },

  basicSalary: { type: Number, required: true, min: 0 },
  grossSalary: { type: Number, required: true, min: 0 },
  netSalary: { type: Number, required: true, min: 0 },

  medicalAllowance: { type: Number, default: 0, min: 0 },
  conveyanceAllowance: { type: Number, default: 0, min: 0 },
  specialAllowance: { type: Number, default: 0, min: 0 },
  travelingAllowance: { type: Number, default: 0, min: 0 },
  hra: { type: Number, default: 0, min: 0 },

  totalDays: { type: Number, default: 0, min: 0 },
  workedDays: { type: Number, default: 0, min: 0 },
  PAN: { type: String, default: 0, min: 0 },
  
  TDS: { type: Number, default: 0, min: 0 },
  holidayPayout: { type: Number, default: 0, min: 0 },
  totalAllowances: { type: Number, default: 0, min: 0 },
  totalDeductions: { type: Number, default: 0, min: 0 },
  bonuses: { type: Number, default: 0, min: 0 },

  paymentMethod: { 
    type: String, 
    enum: ['Bank Transfer', 'Cash', 'Cheque', 'UPI'],
    default:'Bank Transfer',
    required: true 
  },
  
  pfDeduction: { type: Number, default: 0, min: 0 },
  loanDeduction: { type: Number, default: 0, min: 0 },
  ptDeduction: { type: Number, default: 0, min: 0 },

  generatedAt: { type: Date, default: Date.now },
  adminPermission:{type : Boolean , default: false},
  status: { 
    type: String, 
    enum: ['pending', 'processed', 'paid','onHold'], 
    default: 'pending' 
  },
  payDate: { type: Date, required: false },
  modifiedAt: { type: Date },

}, { timestamps: true });

const payrollModel= mongoose.model('Payroll', PayrollSchema);

export default payrollModel
