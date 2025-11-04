import express from "express";
import {
  createElectronicItem,
  getAllElectronicItems,
  getElectronicItemById,
  updateElectronicItem,
  deleteElectronicItem,
} from "../controllers/electronicItemController.js";

const electronicItemRouter = express.Router();

electronicItemRouter.post("/create", createElectronicItem);
electronicItemRouter.get("/all", getAllElectronicItems);
electronicItemRouter.get("/get/:id", getElectronicItemById);
electronicItemRouter.put("/update/:id", updateElectronicItem);
electronicItemRouter.delete("/delete/:id", deleteElectronicItem);

export default electronicItemRouter;
