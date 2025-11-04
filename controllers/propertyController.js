import propertyModel from "../models/propertyModel.js";





export const addProperty = async (req, res) => {
    try {
        const property = new propertyModel(req.body);
        const savedProperty = await property.save();

        return res.status(201).json({
            success: true,
            message: "Property Agreement added successfully",
            data: savedProperty,
        });
    } catch (error) {
        console.error("Add Property Error:", error);
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((val) => val.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: messages,
            });
        }
        return res.status(500).json({
            success: false,
            message: "Server error while adding property",
            error: error.message,
        });
    }
};


export const getAllProperties = async (req, res) => {
    try {
        const properties = await propertyModel.find().sort({ agreementEndDate: -1 });
        return res.status(200).json({
            success: true,
            count: properties.length,
            data: properties,
        });
    } catch (error) {
        console.error("Get Properties Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching property list",
            error: error.message,
        });
    }
};


export const getPropertyById = async (req, res) => {
    try {
        const { id } = req.params;
        const property = await propertyModel.findById(id);

        if (!property)
            return res.status(404).json({
                success: false,
                message: "Property not found",
            });

        return res.status(200).json({
            success: true,
            data: property,
        });
    } catch (error) {
        console.error("Get Property Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching property",
            error: error.message,
        });
    }
};



export const updateProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedProperty = await propertyModel.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!updatedProperty)
            return res.status(404).json({
                success: false,
                message: "Property not found",
            });

        return res.status(200).json({
            success: true,
            message: "Property updated successfully",
            data: updatedProperty,
        });
    } catch (error) {
        console.error("Update Property Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating property",
            error: error.message,
        });
    }
};


export const deleteProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedProperty = await propertyModel.findByIdAndDelete(id);

        if (!deletedProperty)
            return res.status(404).json({
                success: false,
                message: "Property not found",
            });

        return res.status(200).json({
            success: true,
            message: "Property deleted successfully",
        });
    } catch (error) {
        console.error("Delete Property Error:", error);
        return res.status(500).json({
            success: false,
            message: "Error deleting property",
            error: error.message,
        });
    }
};