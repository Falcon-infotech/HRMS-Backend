import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import requestIp from 'request-ip';
import geoip from 'geoip-lite';
import userModel from '../models/userModel.js';
import { sendNotification } from '../utils/notificationutils.js';
import designationModel from '../models/designationModel.js';
import departmentModel from '../models/departmentModel.js';
import refreshModel from '../models/refreshTokenModel.js';
dotenv.config();



const generateAccessToken = (user) => {
  return jwt.sign(
    { _id: user._id, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

const generateRefreshToken = (user) => {
  const refreshToken = jwt.sign(
    { _id: user._id, role: user.role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
  );

  return refreshToken;
};



export const login = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await userModel.findOne({ email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (!user) {
      return res.status(404).json({ success: false, statusCode: 404, message: 'User not found' });
    }

      const token = jwt.sign(
    { _id: user._id, role: user.role },process.env.JWT_SECRET,{ expiresIn: '9h' });

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

       await refreshModel.create({ userId: user._id, token: refreshToken });

      const ip = requestIp.getClientIp(req);
      const geo =geoip.lookup(ip && ip !== '::1' ? ip : '49.37.210.1');
      const loginTime = new Date();
      const timezone = geo?.timezone || 'Timezone not found';

      user.timeZone= timezone;
      user.lastLogin = loginTime;

      await user.save();

        res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,              
        sameSite: 'Strict',        
        maxAge: 15 * 24 * 60 * 60 * 1000,
      });

    res.json({
      success : true,  
      statusCode: 200,
      message: 'Login successful',
      accessToken,
      // refreshToken,
      //  token,
       user,
       });
  } catch (err) {
    res.status(400).json({success : false,  statusCode: 400, error: err.message });
  }
};


export const register = async (req, res) => {
  try {

    const { email,department, designation } = req.body;
    const userId=req.user._id
    console.log(userId)
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success : false,  statusCode: 400,message:"Email already exists", error: "Email already exists" });
    }


    const departmentExists = await departmentModel.findOne({ name: department });
    if (!departmentExists) {
      await departmentModel.create({ name: department });
    }


    const designationExists = await designationModel.findOne({ name: designation });
    if (!designationExists) {
      await designationModel.create({ name: designation });
    }
    
    const user = await userModel.create(req.body);
    const loginUser = await userModel.findById(userId);
    const userObj = user.toObject();
    delete userObj.password;

        await sendNotification({
      forRoles: ["admin", "hr"], 
      title: "New Employee Joined",
      message: `${loginUser.first_name} ${loginUser.last_name}  added a new employee: ${user.first_name} ${user.last_name}`,
      link: `/employees`,
      type: "admin",
      performedBy: loginUser._id
    });

    res.status(201).json({success : true,  statusCode: 201,
      message: 'Users Created successfully', user: userObj});
  } catch (err) {
    res.status(400).json({success : false,  statusCode: 400, message: 'Failed to create user', error: err.message });
  }
};


export const refreshToken =async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

  const existingToken = await refreshModel.findOne({ token });
  if (!existingToken) return res.status(403).json({ message: "Refresh token is invalid or already used" });

    jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async  (err, decoded) => {
      if (err) {
        console.error("Token verification failed:", err.message);
        return res.status(403).json({ success: false, message: "Refresh token expired or invalid" });
      }

      const userId = decoded._id;
      const user = await userModel.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      await refreshModel.findOneAndReplace({ token }, { userId: userId, token: newRefreshToken });

        res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 15 * 24 * 60 * 60 * 1000,
      });

      // const newAccessToken = generateAccessToken({ _id: user.id, role: user.role });
      return res.status(200).json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken, });
    });
  } catch (error) {
    console.error("Error in refreshToken:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const logout =async (req, res) => {
  try {
  const { token } = req.body;

  await refreshModel.findOneAndDelete({ token });

  res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error in logout:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

