CREATE TABLE zitadel.administrator_role_permissions(
    role_name TEXT NOT NULL CHECK (role_name <> '')
    , permission TEXT NOT NULL CHECK (permission <> '')

    , PRIMARY KEY (permission, role_name)
);
