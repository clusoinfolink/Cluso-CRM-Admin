import { InferSchemaType, Model, Schema, models, model } from "mongoose";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "superadmin",
        "admin",
        "verifier",
        "customer",
        "delegate",
        "delegate_user",
        "candidate",
      ],
      required: true,
    },
    assignedCompanies: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    parentCustomer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    selectedServices: [
      {
        serviceId: {
          type: Schema.Types.ObjectId,
          ref: "Service",
          required: true,
        },
        serviceName: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, enum: SUPPORTED_CURRENCIES, default: "INR" },
      },
    ],
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: string };

const existingUserRoleValues = models.User?.schema.path("role")?.options?.enum;
const hasCandidateRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("candidate");
const hasDelegateUserRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("delegate_user");

if (
  models.User &&
  (!models.User.schema.path("selectedServices") ||
    !models.User.schema.path("assignedCompanies") ||
    !hasCandidateRole ||
    !hasDelegateUserRole)
) {
  delete models.User;
}

const User = (models.User as Model<UserDocument>) || model("User", UserSchema);

export default User;
