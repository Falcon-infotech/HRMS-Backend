import mongoose from "mongoose";

const propertySchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: [true, "Company Name is required"],
            trim: true,
        },
        country: {
            type: String,
            required: [true, "Country is required"],
            trim: true,
        },
        propertyAddress: {
            type: String,
            required: [true, "Property Name and Address is required"],
            trim: true,
        },
        agreementBetween: {
            type: String,
            required: [true, "Agreement between parties is required"],
            trim: true,
        },
        agreementStartDate: {
            type: Date,
            required: [true, "Agreement Start Date is required"],
        },
        agreementEndDate: {
            type: Date,
            required: [true, "Agreement End Date is required"],
        },
        currency: {
            type: String,
            required: [true, "Currency (CYN) is required"],
            default: "INR",
        },
        depositPaid: {
            type: String,
            required: [true, "Deposit amount is required"],
        },
        rentAmount: {
            type: Number,
            required: [true, "Rent Amount is required"],
            min: [0, "Rent must be positive"],
        },
        frequency: {
            type: String,
            required: [true, "Payment Frequency is required"],

        },
        depositTerms: {
            type: String,
            required: [true, "Terms and conditions regarding deposit are required"],
            trim: true,
        },
        keyHolder: {
            type: String,
            required: [true, "Key Holder name(s) are required"],
            trim: true,
        },
    },
    { timestamps: true }
);

const propertyModel = mongoose.model("Property", propertySchema);

export default propertyModel;
