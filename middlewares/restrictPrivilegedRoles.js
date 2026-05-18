// Middleware: restrict privileged role assignment
const restrictPrivilegedRoles = (req, res, next) => {
    const { role } = req.body // role user is trying to assign
    const privilegedRoles = ['Admin', 'ParentEvaluator']
  
    // If role is privileged, only admins can assign
    if (privilegedRoles.includes(role) && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to assign this role',
      })
    }
    next()
  }
  export default restrictPrivilegedRoles
