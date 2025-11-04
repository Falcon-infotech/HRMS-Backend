import express from "express";
import {
  addLicense,
  getAllLicenses,
  getLicenseById,
  updateLicense,
  deleteLicense,
} from "../controllers/licenseController.js";

const licenseRouter = express.Router();

licenseRouter.post("/create", addLicense);
licenseRouter.get("/all", getAllLicenses);
licenseRouter.get("/get/:id", getLicenseById);
licenseRouter.put("/update/:id", updateLicense);
licenseRouter.delete("/delete/:id", deleteLicense);

export default licenseRouter;
