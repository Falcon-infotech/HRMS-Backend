import express from "express";
import {
  addProperty,
  getAllProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
} from "../controllers/propertyController.js";

const propertyRouter = express.Router();

propertyRouter.post("/create", addProperty);
propertyRouter.get("/all", getAllProperties);
propertyRouter.get("/get/:id", getPropertyById);
propertyRouter.put("/update/:id", updateProperty);
propertyRouter.delete("/delete/:id", deleteProperty);

export default propertyRouter;
