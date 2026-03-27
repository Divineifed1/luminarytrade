/**
 * schemas.ts
 *
 * Ajv-based validation schemas for common form types.
 */

import Ajv, { JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";
import { EMAIL_REGEX, PHONE_REGEX, STELLAR_ADDRESS_REGEX } from "./rules";

const ajv = new Ajv({ allErrors: true, $data: true });
addFormats(ajv);

// Custom formats
ajv.addFormat("stellar-address", STELLAR_ADDRESS_REGEX);
ajv.addFormat("e164-phone", PHONE_REGEX);

export interface TransactionFormValues {
  to: string;
  amount: number;
  memo?: string;
}

export const transactionSchema: JSONSchemaType<TransactionFormValues> = {
  type: "object",
  properties: {
    to: { type: "string", format: "stellar-address" },
    amount: { type: "number", minimum: 0.0000001 },
    memo: { type: "string", maxLength: 28, nullable: true },
  },
  required: ["to", "amount"],
  additionalProperties: false,
};

export const validateTransaction = ajv.compile(transactionSchema);

export default ajv;
