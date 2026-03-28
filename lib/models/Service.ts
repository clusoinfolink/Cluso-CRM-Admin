import mongoose, { Document, Model, Schema } from "mongoose";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";

export type ServiceFormFieldType = "text" | "long_text" | "number" | "file";

export type ServiceFormField = {
  question: string;
  fieldType: ServiceFormFieldType;
  required: boolean;
};

export interface IService extends Document {
  name: string;
  description: string;
  defaultPrice?: number;
  defaultCurrency: SupportedCurrency;
  formFields: ServiceFormField[];
  createdAt: Date;
  updatedAt: Date;
}

const serviceSchema = new Schema<IService>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    defaultPrice: { type: Number },
    defaultCurrency: { type: String, enum: SUPPORTED_CURRENCIES, default: "INR" },
    formFields: [
      {
        question: { type: String, required: true },
        fieldType: {
          type: String,
          enum: ["text", "long_text", "number", "file"],
          required: true,
        },
        required: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

const hasEnhancedServiceFields = Boolean(
  mongoose.models.Service?.schema.path("formFields.required"),
);

if (
  mongoose.models.Service &&
  (!mongoose.models.Service.schema.path("formFields") || !hasEnhancedServiceFields)
) {
  delete mongoose.models.Service;
}

const Service: Model<IService> =
  mongoose.models.Service || mongoose.model<IService>("Service", serviceSchema);

export default Service;