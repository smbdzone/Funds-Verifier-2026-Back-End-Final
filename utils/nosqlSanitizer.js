const DANGEROUS_OPERATORS = [
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$ne",
  "$in",
  "$nin",
  "$exists",
  "$regex",
  "$or",
  "$and",
  "$nor",
  "$not",
  "$all",
  "$elemMatch",
  "$size",
  "$type",
  "$mod",
  "$where",
  "$text",
  "$expr",
  "$jsonSchema",
  "$geoWithin",
  "$geoIntersects",
  "$near",
  "$nearSphere",
];

export const sanitizeValue = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.constructor === Object
  ) {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      if (DANGEROUS_OPERATORS.includes(key)) {
        continue;
      }
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  return value;
};

export const sanitizeQuery = (queryObj, allowedFields = null) => {
  if (!queryObj || typeof queryObj !== "object") {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(queryObj)) {
    // Block dangerous operators at top level
    if (DANGEROUS_OPERATORS.includes(key)) {
      continue;
    }

    // If allowedFields is specified, only include whitelisted fields
    if (allowedFields && !allowedFields.includes(key)) {
      continue;
    }

    // Sanitize the value
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
};

export const sanitizeEmail = (email) => {
  if (!email || typeof email !== "string") {
    return null;
  }
  const sanitized = email.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
};

export const sanitizeUUID = (uuid) => {
  if (!uuid || typeof uuid !== "string") {
    return null;
  }

  const sanitized = uuid.trim();

  if (!/^[a-zA-Z0-9\-]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
};

export const escapeRegex = (input) => {
  if (!input || typeof input !== "string") {
    return "";
  }
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const sanitizeNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  return num;
};

export const sanitizeMongoId = (id) => {
  if (!id) {
    return null;
  }

  const idStr = String(id).trim();

  if (!/^[a-f\d]{24}$/i.test(idStr)) {
    return null;
  }

  return idStr;
};

export const removeOperators = (query) => {
  if (!query || typeof query !== "object") {
    return {};
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("$")) {
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const cleanedValue = removeOperators(value);
      if (Object.keys(cleanedValue).length > 0) {
        cleaned[key] = cleanedValue;
      }
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
};

export default {
  sanitizeValue,
  sanitizeQuery,
  sanitizeEmail,
  sanitizeUUID,
  escapeRegex,
  sanitizeNumber,
  sanitizeMongoId,
  removeOperators,
};