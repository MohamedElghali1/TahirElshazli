export enum Role {
  Visitor = 'visitor',
  Student = 'student',
  Parent = 'parent',
  Assistant = 'assistant',
  // The Full admin: identical permission to the teacher, distinct identity.
  // Declared before Teacher so the declaration order matches the privilege
  // order, which is how every document in docs/ lists the six roles.
  Admin = 'admin',
  Teacher = 'teacher',
}
