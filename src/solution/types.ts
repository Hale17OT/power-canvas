import type {SharedType} from './schema.js';
/** Null means no supported mapping. This registry never substitutes a text column for an unsupported native type. */
export const sharedTypeRegistry:Record<SharedType,{dataverse:string|null;canvas:string|null;flow:string|null;limitations:string[]}>={
 string:{dataverse:'text',canvas:'text',flow:'string',limitations:[]},
 multiline:{dataverse:'multilineText',canvas:'multiline',flow:'string',limitations:[]},
 integer:{dataverse:'integer',canvas:'number',flow:'integer',limitations:[]},
 decimal:{dataverse:'decimal',canvas:'number',flow:'number',limitations:[]},
 currency:{dataverse:null,canvas:'currency',flow:'number',limitations:['Dataverse money provisioning unavailable; currency code/rounding must remain explicit.']},
 percentage:{dataverse:'decimal',canvas:'percentage',flow:'number',limitations:['Intent uses the 0–100 scale, not a fractional conversion.']},
 boolean:{dataverse:'boolean',canvas:'boolean',flow:'boolean',limitations:[]},
 choice:{dataverse:'choice',canvas:'singleChoice',flow:'integer',limitations:['Validate exact native option values; labels are not identity.']},
 multiChoice:{dataverse:null,canvas:'multiChoice',flow:'array',limitations:['No current native provisioning adapter; specify item shape.']},
 lookup:{dataverse:'relationship',canvas:'lookup',flow:'recordRef',limitations:['Requires declared target and verified metadata; no display-name adoption.']},
 person:{dataverse:null,canvas:'person',flow:'guid',limitations:['User/group identity and authorization must be explicit.']},
 date:{dataverse:'dateTime/dateOnly',canvas:'date',flow:'date',limitations:[]},
 datetime:{dataverse:'dateTime/userLocal',canvas:'datetime',flow:'datetime',limitations:['Time-zone contract is required at the native field boundary.']},
 guid:{dataverse:null,canvas:'text',flow:'guid',limitations:['Identity validation is required; no custom GUID column provisioning adapter.']},
 email:{dataverse:'text',canvas:'email',flow:'email',limitations:['Conceptual email validation is distinct from text storage.']},
 file:{dataverse:null,canvas:null,flow:'binary',limitations:['File upload/storage provisioning is unavailable in this unified adapter.']},
 fileReference:{dataverse:null,canvas:'url',flow:'string',limitations:['External identity and access must be verified; not a packaged file.']},
};
