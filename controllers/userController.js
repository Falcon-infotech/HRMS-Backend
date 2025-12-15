import User from '../models/userModel.js';
import moment from 'moment-timezone';
import bcrypt from 'bcryptjs';
import { sendNotification } from '../utils/notificationutils.js';
import userModel from '../models/userModel.js';
import departmentModel from '../models/departmentModel.js';
import designationModel from '../models/designationModel.js';
import { withoutDeletedUsers } from '../utils/commonUtils.js'
import crypto from "crypto";
import timezoneToCountryName from '../utils/timeZoneToCountryName.js';

// Save User Time Zone
export const saveUserTimeZone = async (req, res) => {
  try {
    const { timeZone } = req.body;

    if (!timeZone) {
      return res.status(400).json({ statusCode: 400, success: false, message: 'Time zone is required' });
    }

    //  Validate timeZone using moment-timezone
    const isValidTimeZone = moment.tz.zone(timeZone);
    if (!isValidTimeZone) {
      return res.status(400).json({ statusCode: 400, success: false, message: 'Invalid time zone provided' });
    }

    const countryDetailsByTimeZone = timezoneToCountryName(timeZone);
    const existingCountry = await countryTZModel.findOne({ tz: timeZone });

    if (!existingCountry) {
      const timeZoneObj = await countryTZModel.create({
        name: countryDetailsByTimeZone ? countryDetailsByTimeZone.name : 'Country not found',
        tz: timeZone,
        code: countryDetailsByTimeZone ? countryDetailsByTimeZone.code : 'Code not found'
      });
      console.log("New timeZoneObject created:", timeZoneObj);
    } else {
      console.log("Country already exists, skipping creation:", existingCountry);
    }


    const user = await User.findByIdAndUpdate(
      req.user._id,
      { timeZone },
      { new: true, runValidators: true }
    ).select('timeZone');

    if (!user) {
      return res.status(404).json({ statusCode: 404, success: false, message: 'User not found' });
    }

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'Time zone updated successfully',
      data: { timeZone: user.timeZone },
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to update time zone',
      error: error.message,
    });
  }
};

// Get All Users
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    // const filter = withoutDeletedUsers(req.user.role === 'hr' ? { role: { $in: ['employee', 'hr'] } } : { role: { $in: ['employee', 'hr', 'admin'] } })
    const users = await User.find(withoutDeletedUsers()).populate("branch", "_id branchName")
      .select("-password -__v")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await User.countDocuments(withoutDeletedUsers());

    // console.log("Fetched Users:", users);
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Users fetched successfully',
      data: {
        count: users.length,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        users,
      },
    });
  } catch (error) {
    res.status(500).json({ statusCode: 500, success: false, message: 'Failed to fetch users', error: error.message });
  }
};

export const getAllUsersWithoutPagination = async (req, res) => {
  try {
    // Apply role-based filter
    // const filter = withoutDeletedUsers(
    //   req.user.role === 'hr'
    //     ? { role: { $in: ['employee', 'hr'] } }
    //     : { role: { $in: ['employee', 'hr', 'admin'] } }
    // );

    // Fetch all users based on filter
    const users = await User.find(withoutDeletedUsers())
      .select("first_name last_name email _id phone department userId designation joining_date salary")
      .populate("branch") 
      .lean();

    const total = users.length;

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Users fetched successfully',
      data: {
        count: total,
        users,
      },
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to fetch users',
      error: error.message,
    });
  }
};


export const getAllDeletedUsers = async (req, res) => {
  try {
    // const { page = 1, limit = 15 } = req.query;
    const baseFilter =
      req.user.role === 'hr'
        ? { role: 'employee' }
        : { role: { $in: ['employee', 'hr', 'admin'] } };

    const filter = { isDeleted: true };
    const users = await User.find(filter).populate({
      path: "branch",
      select: "branchName _id",
    }).select('-password -__v')
    // .skip((page - 1) * limit)
    // .limit(Number(limit));


    const total = await User.countDocuments({ isDeleted: true });

    // console.log("Fetched Users:", users);
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Deleted users fetched successfully',
      data: {
        count: users.length,
        totalRecords: total,
        // totalPages: Math.ceil(total / limit),
        // currentPage: Number(page),
        users,
      },
    });
  } catch (error) {
    res.status(500).json({ statusCode: 500, success: false, message: 'Failed to fetch users', error: error.message });
  }
};

// Get User by ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -__v');

    if (!user) {
      return res.status(404).json({ statusCode: 404, success: false, message: 'User not found' });
    }

    if (req.user.role === 'hr' && user.role !== 'employee') {
      return res.status(403).json({ statusCode: 403, success: false, message: 'Access denied' });
    }

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'User fetched successfully',
      data: user,
    });
  } catch (error) {
    res.status(500).json({ statusCode: 500, success: false, message: 'Failed to fetch user', error: error.message });
  }
};

// Update User
export const updateUser = async (req, res) => {
  try {
    const loginUserId = req.user._id;
    const loginUser = await userModel.findById(loginUserId);
    const { password, role, department, designation, ...updateData } = req.body;

    // Block password update
    if (password) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        message: "You don't have permission to reset the password"
      });
    }

    // Block role update
    if (role) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        message: "Role cannot be updated here"
      });
    }

    // Handle department
    if (department) {
      const departmentExists = await departmentModel.findOne({ name: department });
      if (!departmentExists) {
        await departmentModel.create({ name: department });
      }
      updateData.department = department;
    }

    // Handle designation
    if (designation) {
      const designationExists = await designationModel.findOne({ name: designation });
      if (!designationExists) {
        await designationModel.create({ name: designation });
      }
      updateData.designation = designation;
    }

    // Update user
    const updatedUser = await userModel.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!updatedUser) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: 'User not found'
      });
    }

    // Send notification
    await sendNotification({
      forRoles: ["admin", "hr"],
      title: "User Updated",
      message: `${loginUser.first_name} ${loginUser.last_name} updated details of ${updatedUser.first_name} ${updatedUser.last_name}`,
      link: `/employees`,
      type: "admin",
      performedBy: loginUser._id
    });

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};


export const updateUserRole = async (req, res) => {
  try {
    const loginUserId = req.user._id;
    const loginUser = await userModel.findById(loginUserId);
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "Role is required"
      });
    }

    // Only superAdmin can update role
    if (!["superAdmin"].includes(loginUser.role)) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        message: "You don't have permission to change roles"
      });
    }

    const updatedUser = await userModel.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: "User not found"
      });
    }

    await sendNotification({
      forRoles: ["admin", "hr"],
      title: "User Role Updated",
      message: `${loginUser.first_name} ${loginUser.last_name} changed role of ${updatedUser.first_name} ${updatedUser.last_name} to ${role}`,
      link: `/employees`,
      type: "admin",
      performedBy: loginUser._id
    });

    res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'Role updated successfully',
      data: updatedUser
    });

  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to update role',
      error: error.message
    });
  }
};


//update profile by self
export const updateProfileBySelf = async (req, res) => {
  try {


    const userId = req?.user?._id;
    const { department, address } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in token',
      });
    }

    const updateData = {};

    // Update department
    if (department) updateData['department'] = department;

    // Update nested address using dot notation
    if (address) {
      if (address.country) updateData['address.country'] = address.country;
      if (address.state) updateData['address.state'] = address.state;
      if (address.city) updateData['address.city'] = address.city;
      if (address.village) updateData['address.village'] = address.village;
      if (address.address_line) updateData['address.address_line'] = address.address_line;
      if (address.pincode) updateData['address.pincode'] = address.pincode;
    }


    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true, strict: false }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    });

  } catch (error) {
    console.error("Update Error: ", error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

// Update User Password
export const updateUserPassword = async (req, res) => {
  try {
    const { password } = req.body;

    const loginUserId = req.user._id
    const loginUser = await userModel.findById(loginUserId);

    if (!password) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: 'Password is required',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ statusCode: 404, success: false, message: 'User not found' });
    }

    await sendNotification({
      forRoles: ["admin", "hr"],
      title: "Password Updated",
      message: `${loginUser.first_name} ${loginUser.last_name} updated the password for a user`,
      // link: `/admin/users/${req.params.id}`,
      type: "admin",
      performedBy: loginUser._id
    });

    await sendNotification({
      userId: updatedUser._id,
      title: "Your Password was Updated",
      message: `Your account password was updated by ${loginUser.first_name} ${loginUser.last_name}.`,
      // link: `/user/profile`,
      type: "user",
      performedBy: loginUser._id
    });


    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to update password',
      error: error.message,
    });
  }
};

// Delete User
export const deleteUser = async (req, res) => {
  try {

    const loginUserId = req.user._id
    const loginUser = await userModel.findById(loginUserId);

    const userToDelete = await userModel.findById(req.params.id);
    if (!userToDelete) {
      return res
        .status(404)
        .json({ statusCode: 404, success: false, message: "User not found" });
    }

    // Generate random 6 characters
    const randomStr = crypto.randomBytes(3).toString("hex"); // 6 chars

    // Split email into [username, domain]
    const [username, domain] = userToDelete.email.split("@");
    const newEmail = `${username}_${randomStr}@${domain}`;

    // const deletedUser = await User.findByIdAndDelete(req.params.id);
    const deletedUser = await userModel.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, email: newEmail },
      { new: true }
    );


    if (!deletedUser) {
      return res.status(404).json({ statusCode: 404, success: false, message: 'User not found' });
    }

    if (!deletedUser) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: 'User not found',
      });
    }

    await sendNotification({
      forRoles: ["admin", "hr","superAdmin"],
      title: "User Deleted",
      message: `${loginUser.first_name} ${loginUser.last_name} deleted user ${deletedUser.first_name} ${deletedUser.last_name}`,
      link: `/employees`,
      type: "admin",
      performedBy: loginUser._id
    });

    res.status(200).json({ statusCode: 200, success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ statusCode: 500, success: false, message: 'Failed to delete user', error: error.message });
  }
};

// Get Dashboard by Role
export const getDashboard = async (req, res) => {
  try {
    switch (req.user.role) {
      case 'admin':
        return res.status(200).json({ statusCode: 200, success: true, message: 'Admin Dashboard' });
      case 'hr':
        return res.status(200).json({ statusCode: 200, success: true, message: 'HR Dashboard' });
      case 'employee':
        return res.status(200).json({ statusCode: 200, success: true, message: 'Employee Dashboard' });
      default:
        return res.status(403).json({ statusCode: 403, success: false, message: 'Unauthorized role' });
    }
  } catch (error) {
    res.status(500).json({ statusCode: 500, success: false, message: 'Failed to fetch dashboard', error: error.message });
  }
};


export const getAllDepartments = async (req, res) => {
  try {
    // console.log("test")
    const departments = await departmentModel.find()
    // console.log("department",departments)
    res.status(200).json({
      success: true,
      statusCode: 200,
      data: departments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Failed to fetch departments",
      error: error.stack,
    });
  }
};



export const getAllDesignations = async (req, res) => {
  try {
    const designations = await designationModel.find().sort({ name: 1 });
    res.status(200).json({
      success: true,
      statusCode: 200,
      data: designations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: "Failed to fetch designations",
      error: error.message,
    });
  }
};



export const addIsDeletedField = async (req, res) => {
  try {
    const result = await userModel.updateMany(
      { isDeleted: { $exists: false } }, // jisme nahi hai
      { $set: { isDeleted: false } }     // default add karo
    );

    res.status(200).json({
      success: true,
      message: "isDeleted field added to all missing documents",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Migration failed",
      error: error.message
    });
  }
};



