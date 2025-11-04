import electronicItemModel from "../models/electronicItemModel.js";



const sendResponse = (res, statusCode, success, message, data = null, error = null) => {
  return res.status(statusCode).json({
    success,
    message,
    ...(data && { data }),
    ...(error && { error }),
  });
};



export const createElectronicItem = async (req, res) => {
  try {
    const newItem = new electronicItemModel(req.body);
    await newItem.save();
    return sendResponse(res, 201, true, "Electronic item created successfully", newItem);
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendResponse(res, 400, false, "Validation failed", null, error.message);
    }
    if (error.code === 11000) {
      return sendResponse(res, 400, false, "Duplicate serial number not allowed", null, error.keyValue);
    }
    return sendResponse(res, 500, false, "Server error while creating item", null, error.message);
  }
};


export const getAllElectronicItems = async (req, res) => {
  try {
    const items = await electronicItemModel.find().sort({ createdAt: -1 });
    if (items.length === 0) {
      return sendResponse(res, 200, true, "No items found", []);
    }
    return sendResponse(res, 200, true, "Electronic items fetched successfully", items);
  } catch (error) {
    return sendResponse(res, 500, false, "Server error while fetching items", null, error.message);
  }
};


export const getElectronicItemById = async (req, res) => {
  try {
    const item = await electronicItemModel.findById(req.params.id);
    if (!item) return sendResponse(res, 404, false, "Item not found");
    return sendResponse(res, 200, true, "Electronic item fetched successfully", item);
  } catch (error) {
    return sendResponse(res, 500, false, "Server error while fetching item", null, error.message);
  }
};


export const updateElectronicItem = async (req, res) => {
  try {
    const updatedItem = await electronicItemModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedItem) return sendResponse(res, 404, false, "Item not found");

    return sendResponse(res, 200, true, "Electronic item updated successfully", updatedItem);
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendResponse(res, 400, false, "Validation failed", null, error.message);
    }
    return sendResponse(res, 500, false, "Server error while updating item", null, error.message);
  }
};


export const deleteElectronicItem = async (req, res) => {
  try {
    const deletedItem = await electronicItemModel.findByIdAndDelete(req.params.id);
    if (!deletedItem) return sendResponse(res, 404, false, "Item not found");

    return sendResponse(res, 200, true, "Electronic item deleted successfully");
  } catch (error) {
    return sendResponse(res, 500, false, "Server error while deleting item", null, error.message);
  }
};