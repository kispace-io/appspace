type RxdbModule = typeof import('rxdb');
type RxdbStorageDexieModule = typeof import('rxdb/plugins/storage-dexie');
type RxdbQueryBuilderModule = typeof import('rxdb/plugins/query-builder');
type RxdbMigrationSchemaModule = typeof import('rxdb/plugins/migration-schema');
type RxdbUpdateModule = typeof import('rxdb/plugins/update');

interface RxDbModules {
    rxdb: RxdbModule;
    storageDexie: RxdbStorageDexieModule;
}

let rxdbModulesPromise: Promise<RxDbModules> | null = null;
let pluginsRegistered = false;

async function importRxdbModules(): Promise<[
    RxdbModule,
    RxdbStorageDexieModule,
    RxdbQueryBuilderModule,
    RxdbMigrationSchemaModule,
    RxdbUpdateModule
]> {
    return Promise.all([
        import('rxdb'),
        import('rxdb/plugins/storage-dexie'),
        import('rxdb/plugins/query-builder'),
        import('rxdb/plugins/migration-schema'),
        import('rxdb/plugins/update')
    ]);
}

export async function getRxDbModules(): Promise<RxDbModules> {
    if (!rxdbModulesPromise) {
        rxdbModulesPromise = importRxdbModules().then(([
            rxdb,
            storageDexie,
            queryBuilder,
            migrationSchema,
            update
        ]) => {
            if (!pluginsRegistered) {
                rxdb.addRxPlugin(queryBuilder.RxDBQueryBuilderPlugin);
                rxdb.addRxPlugin(migrationSchema.RxDBMigrationSchemaPlugin);
                rxdb.addRxPlugin(update.RxDBUpdatePlugin);
                pluginsRegistered = true;
            }

            return {
                rxdb,
                storageDexie
            };
        });
    }

    return rxdbModulesPromise;
}


