import React from 'react';
import { useLocation } from 'react-router-dom';
import LegacyFormRoute from './LegacyFormRoute';
import ProjectList, { createProjectAction, editProjectAction, fetchProjectDetail } from './Projects/ProjectList';
import UserList, { editUserAction, fetchUserDetail } from './Users/UserList';
import UserGroupList, { createGroupAction, editGroupAction, fetchGroupDetail } from './UserGroups/UserGroupList';

/** legacy deep links of the identity modal forms (see LegacyFormRoute) */
const useProjectListPath = () =>
  useLocation().pathname.startsWith('/identity/project-admin') ? '/identity/project-admin' : '/identity/project';

export function ProjectCreateRoute() {
  return <LegacyFormRoute list={ProjectList} listPath={useProjectListPath()} action={createProjectAction} />;
}

export function ProjectEditRoute() {
  return (
    <LegacyFormRoute
      list={ProjectList}
      listPath={useProjectListPath()}
      action={editProjectAction}
      load={fetchProjectDetail}
    />
  );
}

export function UserEditRoute() {
  return <LegacyFormRoute list={UserList} listPath="/identity/user-admin" action={editUserAction} load={fetchUserDetail} />;
}

export function UserGroupCreateRoute() {
  return <LegacyFormRoute list={UserGroupList} listPath="/identity/user-group-admin" action={createGroupAction} />;
}

export function UserGroupEditRoute() {
  return (
    <LegacyFormRoute
      list={UserGroupList}
      listPath="/identity/user-group-admin"
      action={editGroupAction}
      load={fetchGroupDetail}
    />
  );
}
