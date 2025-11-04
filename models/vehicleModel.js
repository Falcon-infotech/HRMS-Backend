import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
    {
        itemType: {
            type: String,
            required: [true, "Item Type is required"],
            trim: true,
        },
        name: {
            type: String,
            required: [true, "Vehicle Name is required"],
            trim: true,
        },
        model: {
            type: String,
            required: [true, "Vehicle Model is required"],
            trim: true,
        },
        year: {
            type: Number,
            required: [true, "Year is required"],
            min: [1900, "Invalid year"],
        },
        registrationNo: {
            type: String,
            required: [false, "Registration number is required"],
            default: "-",
            unique: true,
            uppercase: true,
            trim: true,
        },
        insuranceName: {
            type: String,
            required: [false, "Insurance Name is required"],
            default: "-",
            trim: true,
        },
        capitalizedIn: {
            type: String,
            required: [true, "Capitalized In number is required"],
            trim: true,
            default: "-",
        },
        location: {
            type: String,
            trim: true,
            default: "-",
        },
        expiryDate: {
            type: Date,
            required: [true, "Expiry Date is required"],
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

const vehicleModel = mongoose.model("Vehicle", vehicleSchema);

export default vehicleModel;
