import { Factory } from 'lucide-react';
import { SalesforceDescribedObjectPage, type DescribedObjectConfig } from './SalesforceDescribedObjectPage';

const config: DescribedObjectConfig = {
  title: 'Fabrication Yard',
  objectName: 'Fabrication_Yard__c',
  endpoint: '/salesforce-fabrication-yards',
  responseKey: 'fabricationYards',
  slug: 'fabrication-yards',
  singular: 'fabrication yard',
  plural: 'fabrication yards',
  description: 'Read-only Fabrication Yard records from Salesforce with every queryable field. Fields are discovered from Salesforce on each sync.',
  icon: Factory,
};

export function CaptureProSalesforceFabricationYardsPage() {
  return <SalesforceDescribedObjectPage config={config} />;
}