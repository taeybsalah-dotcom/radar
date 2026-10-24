select grantee, table_name, privilege_type, column_name 
from information_schema.column_privileges 
where table_name = 'store_drivers' and grantee in ('anon', 'authenticated');
