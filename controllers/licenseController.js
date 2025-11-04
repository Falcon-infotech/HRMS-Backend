import licenseModel from "../models/licenseModel.js";


// ✅ Create License Record
export const addLicense = async (req, res) => {
    try {
        const license = new licenseModel(req.body);
        const savedLicense = await license.save();
        return res.status(201).json({
            success: true,
            message: "License record added successfully",
            data: savedLicense,
        });
    } catch (error) {
        console.error("Add License Error:", error);
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((val) => val.message);
            return res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Duplicate License/Registration Number" });
        }
        return res.status(500).json({ success: false, message: "Server error while adding license", error: error.message });
    }
};

// 📋 Get All Licenses
export const getAllLicenses = async (req, res) => {
    try {
        const licenses = await licenseModel.find().sort({ expiryDate: -1 });
        return res.status(200).json({
            success: true,
            count: licenses.length,
            data: licenses,
        });
    } catch (error) {
        console.error("Get Licenses Error:", error);
        return res.status(500).json({ success: false, message: "Error fetching license records", error: error.message });
    }
};

// 🔍 Get License by ID
export const getLicenseById = async (req, res) => {
    try {
        const { id } = req.params;
        const license = await licenseModel.findById(id);

        if (!license)
            return res.status(404).json({
                success: false,
                message: "License record not found",
            });

        return res.status(200).json({
            success: true,
            data: license,
        });
    } catch (error) {
        console.error("Get License Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching license record",
            error: error.message,
        });
    }
};

// ✏️ Update License
export const updateLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedLicense = await licenseModel.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!updatedLicense)
            return res.status(404).json({
                success: false,
                message: "License record not found",
            });

        return res.status(200).json({
            success: true,
            message: "License updated successfully",
            data: updatedLicense,
        });
    } catch (error) {
        console.error("Update License Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating license record",
            error: error.message,
        });
    }
};

// ❌ Delete License
export const deleteLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedLicense = await licenseModel.findByIdAndDelete(id);

        if (!deletedLicense)
            return res.status(404).json({
                success: false,
                message: "License record not found",
            });

        return res.status(200).json({
            success: true,
            message: "License deleted successfully",
        });
    } catch (error) {
        console.error("Delete License Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error deleting license record",
            error: error.message,
        });
    }
};
