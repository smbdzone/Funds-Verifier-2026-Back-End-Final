import { RolePermissions } from './rbacRoles.js'

export const checkPermission = (userRole, permissionName) => {
  const rolePerm = RolePermissions[userRole]
  if (!rolePerm) return false
  return !!rolePerm[permissionName]
}
