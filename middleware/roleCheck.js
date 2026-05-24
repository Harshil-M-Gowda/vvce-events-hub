const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};

const isStudent   = roleCheck('student');
const isAdmin     = roleCheck('admin');
const isAuthority = roleCheck('authority');
const isAdminOrAuthority = roleCheck('admin', 'authority');

module.exports = { roleCheck, isStudent, isAdmin, isAuthority, isAdminOrAuthority };
