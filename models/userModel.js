import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    uploads: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Upload",
      },
    ],
    attendance: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attendance",
      },
    ],
    leaves: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Leave",
      },
    ],
    timeZone: { type: String },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false,
    },
    first_name: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      minlength: [2, "First name must be at least 2 characters"],
      maxlength: [50, "First name must be less than 50 characters"],
    },
    last_name: {
      type: String,
      trim: true,
      maxlength: [50, "Last name must be less than 50 characters"],
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      // match: [/^\+[1-9]\d{1,14}$/, "Invalid international phone number"],
      match: [
        /^(\+[1-9][0-9]{1,3}\s?)?[1-9][0-9]{7,14}$/, 
        "Invalid international phone number",
      ],
    },
    email: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true,
      required: [true, "Email is required"],
      match: [/\S+@\S+\.\S+/, "Email format is invalid"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    department: { type: String, required: [true, "Department is required"] },
    userId: { type: String, required: [true, "User ID is required"] },
    address: {
      country: { type: String, required: [true, "Country is required"] },
      state: { type: String, required: [true, "State is required"] },
      city: { type: String, required: [true, "City is required"] },
      village: { type: String, required: [false, "Village is required"] },
      address_line: {
        type: String,
        required: [false, "Address line is required"],
      },
      pincode: {
        type: String,
        required: [false, "Pincode is required"],
        match: [/^[0-9]{6}$/, "Pincode must be a 6-digit number"],
      },
    },
    sickLeaves: {
      type: Number,
      default: 0,
    },
    unpaidLeaves: {
      type: Number,
      default: 0,
    },
    designation: {
      type: String,
      required: [true, "Designation is required"],
    },
    currency: {
      type: String,
      required: [true, "currency code is required"],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false
    },
    joining_date: {
      type: Date,
      required: [true, "Joining date is required"],
    },
    salary: {
      type: Number,
      required: [true, "Salary is required"],
      min: [0, "Salary must be a positive number"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },
    role: {
      type: String,
      enum: ["superAdmin","admin", "hr", "employee"],
      default: "employee",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    payrollDetails: {
      BankName: String,
      accountNumber: Number,
      pfNumber: Number,
      ifscCode: String,
      UNA: Number,
    },
    profileImageUrl: { type: String, default: "" }
  },
  {
    timestamps: true,
  }
);

userSchema.index({
  first_name: "text",
  last_name: "text",
  email: "text",
  department: "text",
  designation: "text"
});


userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

const userModel = mongoose.model("User", userSchema);

export default userModel;
