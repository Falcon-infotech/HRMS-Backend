import mongoose from "mongoose";

const licenseSchema = new mongoose.Schema(
    {
        tradeName: {
            type: String,
            required: [true, "Trade name is required"],
            trim: true,
        },
        location: {
            type: String,
            required: [true, "Location is required"],
            trim: true,
        },
        companyType: {
            type: String,
            required: [true, "Company type/category/status is required"],
            trim: true,
        },
        licenseNumber: {
            type: String,
            required: [true, "License/Registration number is required"],
            trim: true,
            unique: true,
        },
        issuanceDate: {
            type: Date,
            required: [true, "Issuance date is required"],
        },
        expiryDate: {
            type: Date,
            default: null,
        },
        renewalDate: {
            type: Date,
            default: null,
        },
        validUntil: {
            type: Date,
            default: null,
        },
        remarks: {
            type: String,
            trim: true,
            default: "-",
        },
    },
    { timestamps: true }
);

const licenseModel = mongoose.model("License", licenseSchema);

export default licenseModel;
