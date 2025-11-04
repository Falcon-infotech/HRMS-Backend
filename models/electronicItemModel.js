
import mongoose from "mongoose";

const electronicItemSchema = new mongoose.Schema({
    usedBy: {
        type: String,
        trim: true,
    },
    officePhoneNumber: {
        type: String,
        match: [
            /^(\+[1-9][0-9]{1,3}\s?)?[1-9][0-9]{7,14}$/,
            "Invalid international phone number",
        ],
    },
    employeeId: {
        type: String,
        trim: true,
    },
    designation: {
        type: String,
        trim: true,
    },
    itemType: {
        type: String,
        required: [true, "Item type is required"],
        trim: true,
    },
    itemName: {
        type: String,
        required: [true, "Item name is required"],
        trim: true,
    },
    brand: {
        type: String,
        trim: true,
    },
    modelName: {
        type: String,
        trim: true,
    },
    serialNo: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
    },
    configuration: {
        type: String,
        trim: true,
    },
    purchaseDate: {
        type: Date,
    },
    invoiceNo: {
        type: String,
        trim: true,
    },
    issuedDate: {
        type: Date,
    },
    returnedDate: {
        type: Date,
    },
    estimatedValue: {
        type: Number,
        min: [0, "Estimated value cannot be negative"],
    },
    color: {
        type: String,
    },
    condition: {
        type: String,
        enum: ["Good", "Average","Poor", "Damaged", "Under Repair"],
        default: "Good",
    },
    password: {
        type: String,
    },
    error: {
        type: String,
    },
    remarks: {
        type: String,
    },
    accessories: {
        keyboard: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged", "Not Applicable"],
                default: "Not Applicable"
            }
        },
        monitor: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged", "Not Applicable"],
                default: "Not Applicable"
            }
        },
        mouse: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged", "Not Applicable"],
                default: "Not Applicable"
            }
        },
        cpu: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged",  "Not Applicable"],
                default: "Not Applicable"
            }
        },
        chair: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged", "Not Applicable"],
                default: "Not Applicable"
            }
        },
        switch: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged", "Not Applicable"],
                default: "Not Applicable"
            }
        },
        lanCable: {
            available: { type: Boolean, default: false },
            condition: {
                type: String,
                enum: ["Working", "Poor", "Damaged", "Not Applicable"],
                default: "Not Applicable"
            }
        }
    },
    branch: {
        type: String,
    },
    location: {
        type: String,
    },
}, { timestamps: true });


const electronicItemModel = mongoose.model("Item", electronicItemSchema);

export default electronicItemModel;
