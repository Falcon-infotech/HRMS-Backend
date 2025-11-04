
import mongoose from "mongoose";
import vehicleModel from "../models/vehicleModel.js";


export const addVehicle = async (req, res) => {
    try {
        // Step 1: Basic input validation
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Request body cannot be empty",
            });
        }

        // Step 2: Create new vehicle instance
        const vehicle = new vehicleModel(req.body);

        // Step 3: Save to DB
        const savedVehicle = await vehicle.save();

        return res.status(201).json({
            success: true,
            message: "Vehicle added successfully",
            data: savedVehicle,
        });
    } catch (error) {
        console.error("Add Vehicle Error:", error);

        if (error.code === 11000) {
            const duplicatedField = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `Duplicate value for field: ${duplicatedField}`,
            });
        }

        // Fallback for other errors
        return res.status(500).json({
            success: false,
            message: "Server error while adding vehicle",
            error: error.message,
        });
    }
};


export const getAllVehicles = async (req, res) => {
    try {
        const vehicles = await vehicleModel.find().sort({ expiryDate: -1 });
        return res.status(200).json({
            success: true,
            count: vehicles.length,
            data: vehicles,
        });
    } catch (error) {
        console.error("Get Vehicles Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error while fetching vehicles",
            error: error.message,
        });
    }
};


export const getVehicleById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid vehicle ID format",
            });
        }

        const vehicle = await vehicleModel.findById(id);
        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: vehicle,
        });
    } catch (error) {
        console.error("Get Vehicle Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error while fetching vehicle",
            error: error.message,
        });
    }
};



export const updateVehicle = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid vehicle ID format",
            });
        }

        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Request body cannot be empty",
            });
        }

        const updated = await vehicleModel.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Vehicle updated successfully",
            data: updated,
        });
    } catch (error) {
        console.error("Update Vehicle Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while updating vehicle",
            error: error.message,
        });
    }
};


export const deleteVehicle = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid vehicle ID format",
            });
        }

        const deleted = await Vehicle.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Vehicle deleted successfully",
        });
    } catch (error) {
        console.error("Delete Vehicle Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error while deleting vehicle",
            error: error.message,
        });
    }
};