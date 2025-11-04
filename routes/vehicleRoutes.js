import express from "express";
import {
    addVehicle,
    getAllVehicles,
    getVehicleById,
    updateVehicle,
    deleteVehicle,
} from "../controllers/vehicleController.js";

const vehicleRouter = express.Router();

vehicleRouter.post("/create", addVehicle);
vehicleRouter.get("/all", getAllVehicles);
vehicleRouter.get("/get/:id", getVehicleById);
vehicleRouter.put("/update/:id", updateVehicle);
vehicleRouter.delete("/delete/:id", deleteVehicle);

export default vehicleRouter;
