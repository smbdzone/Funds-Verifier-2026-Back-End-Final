const roles = {
  Admin: {
    // Full access
    create: true,
    read: true,
    update: true,
    delete: true,
  },
  AssetHolder: {
    // Only update access
    create: true,
    read: true,
    update: true,
    delete: true,
  },
  DealHunter: {
    // Only update access
    create: false,
    read: true,
    update: false,
    delete: false,
  },
  Trustee: {
    // Read only
    create: false,
    read: false,
    update: false,
    delete: false,
  },
  TechnicalReport: {
    // Anything custom
    create: false,
    read: false,
    update: false,
    delete: false,
  },
  Evaluator: {
    // Anything custom
    create: false,
    read: false,
    update: false,
    delete: false,
  },
  '3dWalkthrough': {
    // Anything custom
    create: false,
    read: false,
    update: false,
    delete: false,
  },
}

export default roles
