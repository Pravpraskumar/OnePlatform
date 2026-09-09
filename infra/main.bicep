// Azure infrastructure for the platform: Container Apps environment, one
// container app per service, a PostgreSQL Flexible Server with a database per
// module, and Key Vault for connection secrets.
@description('Deployment location')
param location string = resourceGroup().location

@description('Environment name (e.g. dev, prod) used as a resource name suffix')
param envName string = 'dev'

@description('PostgreSQL administrator login')
param pgAdminUser string = 'pgadmin'

@description('PostgreSQL administrator password')
@secure()
param pgAdminPassword string

var prefix = 'platform-${envName}'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: replace('${prefix}-kv', '-', '')
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
  }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${prefix}-pg'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: { storageSizeGB: 32 }
    highAvailability: { mode: 'Disabled' }
  }
}

var databases = ['platform_core', 'creditguard', 'prime']

resource pgDatabases 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = [
  for dbName in databases: {
    parent: pg
    name: dbName
  }
]

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-cae'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Service definitions: name, port, and the database it connects to.
var services = [
  { name: 'core-backend', port: 4000, db: 'platform_core' }
  { name: 'creditguard-service', port: 4101, db: 'creditguard' }
  { name: 'prime-service', port: 4102, db: 'prime' }
]

resource apps 'Microsoft.App/containerApps@2024-03-01' = [
  for svc in services: {
    name: '${prefix}-${svc.name}'
    location: location
    properties: {
      managedEnvironmentId: containerEnv.id
      configuration: {
        ingress: {
          external: true
          targetPort: svc.port
          transport: 'auto'
        }
      }
      template: {
        containers: [
          {
            name: svc.name
            image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
            resources: { cpu: json('0.5'), memory: '1Gi' }
            env: [
              { name: 'PORT', value: string(svc.port) }
              { name: 'PGHOST', value: pg.properties.fullyQualifiedDomainName }
              { name: 'PGDATABASE', value: svc.db }
            ]
          }
        ]
        scale: { minReplicas: 1, maxReplicas: 3 }
      }
    }
  }
]

output keyVaultName string = keyVault.name
output postgresFqdn string = pg.properties.fullyQualifiedDomainName
