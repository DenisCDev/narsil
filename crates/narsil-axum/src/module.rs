use crate::ident::require_ident;

#[derive(Clone, Debug)]
pub struct Column {
    pub api: String,
    pub db: String,
}

impl Column {
    pub fn same(name: impl Into<String>) -> Self {
        let name = name.into();
        Self {
            api: name.clone(),
            db: name,
        }
    }

    pub fn mapped(api: impl Into<String>, db: impl Into<String>) -> Self {
        Self {
            api: api.into(),
            db: db.into(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct TableSpec {
    pub table: String,
    pub pk_api: String,
    pub columns: Vec<Column>,
    pub owner_field: Option<String>,
}

impl TableSpec {
    pub fn new(table: impl Into<String>) -> Self {
        let table = table.into();
        Self {
            table,
            pk_api: "id".into(),
            columns: vec![Column::same("id")],
            owner_field: None,
        }
    }

    pub fn pk(mut self, api: impl Into<String>, db: impl Into<String>) -> Self {
        self.pk_api = api.into();
        let db = db.into();
        if let Some(col) = self.columns.iter_mut().find(|c| c.api == self.pk_api) {
            col.db = db;
        } else {
            self.columns
                .insert(0, Column::mapped(self.pk_api.clone(), db));
        }
        self
    }

    pub fn column(mut self, api: impl Into<String>, db: impl Into<String>) -> Self {
        let col = Column::mapped(api, db);
        self.columns.retain(|c| c.api != col.api);
        self.columns.push(col);
        self
    }

    pub fn columns_same<I, S>(mut self, names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for name in names {
            let col = Column::same(name);
            if !self.columns.iter().any(|c| c.api == col.api) {
                self.columns.push(col);
            }
        }
        self
    }

    pub fn owner_field(mut self, api: impl Into<String>) -> Self {
        self.owner_field = Some(api.into());
        self
    }

    pub fn pk_column(&self) -> &Column {
        self.columns
            .iter()
            .find(|c| c.api == self.pk_api)
            .expect("primary key column missing from TableSpec")
    }

    pub fn column_by_api(&self, api: &str) -> Option<&Column> {
        self.columns.iter().find(|c| c.api == api)
    }

    pub fn owner_column(&self) -> Option<&Column> {
        self.owner_field
            .as_deref()
            .and_then(|api| self.column_by_api(api))
    }

    pub(crate) fn validate(&self, uses_owner: bool) {
        require_ident(&self.table, "table");
        for col in &self.columns {
            require_ident(&col.db, "column");
        }
        if uses_owner {
            match &self.owner_field {
                None => panic!(
                    "narsil-axum: table `{}` uses the owner permission but has no owner_field",
                    self.table
                ),
                Some(api) if self.column_by_api(api).is_none() => panic!(
                    "narsil-axum: owner_field `{api}` is not a column of `{}`",
                    self.table
                ),
                Some(_) => {}
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Permission {
    Public,
    Authenticated,
    Owner,
    Admin,
}

#[derive(Clone, Debug, Default)]
pub struct Permissions {
    pub list: Option<Vec<Permission>>,
    pub get: Option<Vec<Permission>>,
    pub create: Option<Vec<Permission>>,
    pub update: Option<Vec<Permission>>,
    pub delete: Option<Vec<Permission>>,
}

impl Permissions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn all_public() -> Self {
        Self {
            list: Some(vec![Permission::Public]),
            get: Some(vec![Permission::Public]),
            create: Some(vec![Permission::Public]),
            update: Some(vec![Permission::Public]),
            delete: Some(vec![Permission::Public]),
        }
    }

    pub fn list(mut self, p: Permission) -> Self {
        self.list = Some(vec![p]);
        self
    }

    pub fn get(mut self, p: Permission) -> Self {
        self.get = Some(vec![p]);
        self
    }

    pub fn create(mut self, p: Permission) -> Self {
        self.create = Some(vec![p]);
        self
    }

    pub fn update(mut self, p: Permission) -> Self {
        self.update = Some(vec![p]);
        self
    }

    pub fn delete(mut self, p: Permission) -> Self {
        self.delete = Some(vec![p]);
        self
    }

    pub fn for_op(&self, op: &str) -> Option<&[Permission]> {
        match op {
            "list" => self.list.as_deref(),
            "get" => self.get.as_deref(),
            "create" => self.create.as_deref(),
            "update" => self.update.as_deref(),
            "delete" => self.delete.as_deref(),
            _ => None,
        }
    }

    pub fn uses_owner(&self) -> bool {
        [
            &self.list,
            &self.get,
            &self.create,
            &self.update,
            &self.delete,
        ]
        .into_iter()
        .flatten()
        .flatten()
        .any(|p| *p == Permission::Owner)
    }
}

#[derive(Clone, Debug)]
pub struct Crud {
    pub list: bool,
    pub get: bool,
    pub create: bool,
    pub update: bool,
    pub delete: bool,
    pub default_limit: i64,
    pub max_limit: i64,
}

impl Default for Crud {
    fn default() -> Self {
        Self {
            list: true,
            get: true,
            create: true,
            update: true,
            delete: true,
            default_limit: 50,
            max_limit: 1000,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Module {
    pub table: TableSpec,
    pub permissions: Permissions,
    pub crud: Crud,
}

impl Module {
    pub fn new(table: TableSpec) -> Self {
        Self {
            table,
            permissions: Permissions::new(),
            crud: Crud::default(),
        }
    }

    pub fn perms(mut self, permissions: Permissions) -> Self {
        self.permissions = permissions;
        self
    }

    pub fn list_limit(mut self, default_limit: i64, max_limit: i64) -> Self {
        self.crud.default_limit = default_limit.max(1);
        self.crud.max_limit = max_limit.max(self.crud.default_limit);
        self
    }

    pub fn crud(mut self, crud: Crud) -> Self {
        self.crud = crud;
        self
    }

    pub fn enabled(&self, op: &str) -> bool {
        match op {
            "list" => self.crud.list,
            "get" => self.crud.get,
            "create" => self.crud.create,
            "update" => self.crud.update,
            "delete" => self.crud.delete,
            _ => false,
        }
    }
}
