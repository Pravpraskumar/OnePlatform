import { Ship } from 'lucide-react';
import { SalesforceDescribedObjectPage, type DescribedObjectConfig } from './SalesforceDescribedObjectPage';

const config: DescribedObjectConfig = {
  title: 'Vessel Data',
  objectName: 'Vessel__c',
  endpoint: '/salesforce-vessels',
  responseKey: 'vessels',
  slug: 'vessels',
  singular: 'vessel',
  plural: 'vessels',
  description: 'Read-only Vessel records from Salesforce with every queryable field. Fields are discovered from Salesforce on each sync.',
  icon: Ship,
};

export function CaptureProSalesforceVesselsPage() {
  return <SalesforceDescribedObjectPage config={config} />;
}