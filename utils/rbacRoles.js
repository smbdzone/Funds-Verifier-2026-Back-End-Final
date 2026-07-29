import { Permissions } from '../constants/permissions.js'

export const RolePermissions = {
  Admin: {
    ...Permissions,
    viewOthersProfile: true,
    editOthersProfile: true,
    deleteOthersAccount: true,
    switchRoles: false,
    systemSettings: true,
    manageSubEvaluators: true,
  },

  Evaluator: {
    ...Permissions,
    viewOthersProfile: true,
    manageSubEvaluators: true,
  },

  SubEvaluator: {
    ...Permissions,
    // inherits defaults
  },

  'Sub-Evaluator': {
    ...Permissions,
  },

  AssetHolder: {
    ...Permissions,
    switchRoles: true,
    editOwnProfile: true,
  },

  DealHunter: {
    ...Permissions,
    switchRoles: true,
    editOwnProfile: true,
  },

  Developer: {
    ...Permissions,
    editOwnProfile: true,
  },

  Advertiser: {
    ...Permissions,
    editOwnProfile: true,
  },

  Trustee: {
    ...Permissions,
  },

  TechnicalReport: {
    ...Permissions,
  },
}
