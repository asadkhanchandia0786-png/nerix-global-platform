export const FIELD_TYPES=['text','textarea','email','phone','number','currency','date','checkbox','select','relation'] as const;
export type FieldType=typeof FIELD_TYPES[number];
export interface BusinessField {key:string;label:string;type:FieldType;required:boolean;options:string[];relationModule?:string;archived?:boolean}
export interface BusinessWorkflow {id:string;name:string;trigger:'created'|'status';status:string;taskTitle:string;dueDays:number;enabled:boolean}
export interface BusinessModule {id:string;company_id:string;name:string;description:string;fields:BusinessField[];stages:string[];workflows:BusinessWorkflow[];version:number;archived:boolean}
const field=(key:string,label:string,type:FieldType='text',options:string[]=[]):BusinessField=>({key,label,type,required:false,options});
export const BUSINESS_TEMPLATES=[
 {key:'general',name:'Sales & customer service',description:'Contacts, opportunities and customer support cases.',modules:[
  {key:'contacts',name:'Contacts',description:'People and businesses you work with.',stages:['Active','Prospect','Inactive'],fields:[field('email','Email','email'),field('phone','Phone','phone'),field('business','Business'),field('notes','Notes','textarea')]},
  {key:'opportunities',name:'Opportunities',description:'Track opportunities through your sales process.',stages:['New','Qualified','Proposal','Won','Lost'],fields:[field('contact','Contact','relation'),field('value','Value','currency'),field('currency','Currency','select',['USD','PKR','GBP','EUR','AED']),field('source','Source'),field('notes','Notes','textarea')]},
  {key:'support',name:'Customer support',description:'Customer requests, ownership and resolution.',stages:['New','In progress','Waiting on customer','Resolved'],fields:[field('contact','Contact','relation'),field('priority','Priority','select',['Low','Normal','High','Urgent']),field('request','Request','textarea'),field('resolution','Resolution','textarea')]}
 ]},
 {key:'courier',name:'Courier & shipping',description:'Customers, shipments and delivery issues. Tracking is entered by your team.',modules:[
  {key:'contacts',name:'Customers',description:'Customer contact details.',stages:['Active','Inactive'],fields:[field('email','Email','email'),field('phone','Phone','phone'),field('address','Address','textarea')]},
  {key:'shipments',name:'Shipments',description:'Order and shipment progress recorded by your team.',stages:['Booked','Collected','In transit','Delivered','Exception'],fields:[field('contact','Customer','relation'),field('tracking','Tracking number'),field('origin','Collection address','textarea'),field('destination','Delivery address','textarea'),field('delivery_date','Expected delivery','date'),field('notes','Delivery notes','textarea')]},
  {key:'support',name:'Delivery support',description:'Delivery questions and issues.',stages:['New','Investigating','Waiting','Resolved'],fields:[field('contact','Customer','relation'),field('tracking','Tracking number'),field('issue','Issue','textarea'),field('resolution','Resolution','textarea')]}
 ]},
 {key:'security',name:'Security services',description:'Clients, protected sites and service incidents.',modules:[
  {key:'contacts',name:'Clients',description:'Client organizations and contacts.',stages:['Prospect','Active','Inactive'],fields:[field('email','Email','email'),field('phone','Phone','phone'),field('contact_name','Contact name')]},
  {key:'sites',name:'Security sites',description:'Site information, contracts and renewal follow-ups.',stages:['Survey','Proposal','Active','Renewal','Closed'],fields:[field('contact','Client','relation'),field('address','Site address','textarea'),field('service','Service type'),field('renewal','Renewal date','date'),field('notes','Notes','textarea')]},
  {key:'support',name:'Service incidents',description:'Track reports and follow-up work.',stages:['Reported','Assigned','Investigating','Resolved'],fields:[field('contact','Client','relation'),field('site','Site name'),field('priority','Priority','select',['Normal','High','Urgent']),field('details','Details','textarea')]}
 ]},
 {key:'insurance',name:'Insurance operations',description:'Clients, policy follow-ups and service requests.',modules:[
  {key:'contacts',name:'Clients',description:'Client contact directory.',stages:['Prospect','Active','Inactive'],fields:[field('email','Email','email'),field('phone','Phone','phone')]},
  {key:'policies',name:'Policies & renewals',description:'Administrative policy tracking; terms are supplied by your team.',stages:['Enquiry','Quoted','Active','Renewal due','Closed'],fields:[field('contact','Client','relation'),field('policy','Policy reference'),field('carrier','Carrier'),field('renewal','Renewal date','date'),field('notes','Notes','textarea')]},
  {key:'support',name:'Service requests',description:'Questions and claim follow-up administration.',stages:['New','In review','Waiting','Resolved'],fields:[field('contact','Client','relation'),field('policy','Policy reference'),field('request','Request','textarea')]}
 ]},
 {key:'practice',name:'Practice administration',description:'Patient contacts, appointment requests and administrative follow-ups. No clinical charting.',modules:[
  {key:'contacts',name:'Patient contacts',description:'Administrative contact details. Use test data until your privacy requirements are reviewed.',stages:['New','Active','Inactive'],fields:[field('email','Email','email'),field('phone','Phone','phone'),field('contact_preference','Contact preference','select',['Phone','Email'])]},
  {key:'appointments',name:'Appointment requests',description:'Requests tracked manually; these do not book an external practice calendar.',stages:['Requested','Confirmed','Completed','Cancelled'],fields:[field('contact','Patient contact','relation'),field('requested_date','Requested date','date'),field('time','Preferred time'),field('office','Office')]},
  {key:'support',name:'Administrative requests',description:'Track non-clinical questions and follow-ups.',stages:['New','Assigned','Waiting','Resolved'],fields:[field('contact','Patient contact','relation'),field('category','Category','select',['Scheduling','Billing enquiry','General']),field('request','Administrative request','textarea')]}
 ]}
] as const;
