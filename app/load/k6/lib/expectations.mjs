/** Expected policy for the unmodified demo role fixtures used by this suite. */
export function accountFor(role) {
  return {
    email: `${role}@dbsarc.com`,
    password: "dbs2025",
    managerPlus: ["owner", "admin", "director", "manager", "pm"].includes(role),
    directorPlus: ["owner", "admin", "director"].includes(role),
    canPost: ["owner", "admin", "director", "manager", "pm", "employee", "partner"].includes(role),
  };
}

export function sessionFor(account, cookie, userId) {
  return { email: account.email, managerPlus: account.managerPlus, directorPlus: account.directorPlus, canPost: account.canPost, cookie, userId };
}

export function expectsThreadAccess(session, project) {
  return project.assignments.some((a) => a.userId === session.userId);
}

export function expectedReadStatus(status, denied = false) {
  return denied ? status === 403 : status >= 200 && status < 300;
}

export function expectedWriteStatus(status, denied = false) {
  return denied ? status === 403 : status === 200 || status === 201 || status === 429;
}
