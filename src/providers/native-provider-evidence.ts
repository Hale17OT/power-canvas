// Generated from the accepted V2 provider evidence manifest. No tenant identities or raw evidence.
export const nativeProviderEvidence = [
  {
    "capability": "dataverse.choice.create",
    "contract": "One global Picklist; exact three numeric option identities; canonical service-name recovery",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "afe69cd06d331dce33f02eab78aec80453bd174488cd0374a6ebae1c584c74cf",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "dataverse.table.create",
    "contract": "Two user/team-owned custom tables with generated text primary names",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "f65da4ae28ac1218f56660a720c418b3a3495ed9a68396808982c537d0b1cb7d",
    "dimensions": [
      "liveCreate",
      "primaryNameCreate",
      "primaryNameReadback",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "dataverse.column.create",
    "contract": "Eight reviewed Probe columns: decimal, integer, date-only, boolean, text, multiline text, user-local datetime and global choice",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "677e828284f563636ec0c457c63f3bc14f6a15c33ec51a8849fc34fd363a4f78",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "dataverse.key.create",
    "contract": "One external-code alternate key; Active async index and explicit managed-property recovery",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "3e38d6a70631c39384bebb01f7256fef0066d5f06cc7a2e7943d73ef57809ec0",
    "dimensions": [
      "liveCreate",
      "activeIndex",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "dataverse.relationship.create",
    "contract": "One many-to-one relationship and generated lookup; restrict delete, no assign/share/unshare/reparent/merge cascade",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "3a53fd6603d2f9ad32938531bd16c4fca4f33b611dc0bfbb58e9c565b27f569f",
    "dimensions": [
      "liveCreate",
      "lookupCreate",
      "lookupReadback",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "dataverse.form.create",
    "contract": "One bounded Probe main form; only reviewed native controls/layout",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "4a11cc129f5ec8c930a3143f1cd896e7733e1359e4ef493fe6a7353e42320119",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "dataverse.view.create",
    "contract": "One public Probe view compiled from typed FetchXML/LayoutXML",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "197466e83aa0e1b7e8e1c582a2564445f6a4ba30084197131c02110bc2c48737",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "modelDriven.navigation.create",
    "contract": "One certification-only app-specific sitemap",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "07baa910e9cc6015056f07a8d65f5189cbca87f4e38e7822950a17bddceedb8b",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "modelDriven.app.create",
    "contract": "One solution-owned Unified Interface AppModule; draft/unpublished identity",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "20f0946af7e50e007fe0fe20a7ae31353816e774ba421a45509902a5a16bf339",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "modelDriven.component.add",
    "contract": "Five reviewed table/form/view/sitemap associations",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "eb764c95f678c7bddd55d31ce7f2d46b16a600bce26dc8e8c5f8dcd616afd5cc",
    "dimensions": [
      "liveApply",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "modelDriven.validate",
    "contract": "ValidateApp true, zero errors, retained Category warning",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "b9859b4a54fb48ed78a35f2732e7f0f51aef5e490bedbefab65534f1f73a5d53",
    "dimensions": [
      "liveValidation",
      "liveReadback"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "security.role.create",
    "contract": "One root-business-unit certification role; no human/team assignment",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "23792e839476150648062b22b200c0f3355b40801bac7f96d91e6888a29528e3",
    "dimensions": [
      "liveCreate",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  },
  {
    "capability": "security.privilege.configure",
    "contract": "Exactly two custom-table Basic Read grants resolved by stable metadata IDs; no broader depths or revocation",
    "manifestHash": "e6e379282d6213a83786fcbc9b408ddedbd7f81b0649a3ae6a1079336d40fe33",
    "proofHash": "720c9660bfec9a9743d87727658ad864e5bc520814cc445fa20ea34e79fecd5c",
    "dimensions": [
      "liveApply",
      "liveReadback",
      "liveNoOp"
    ],
    "limitations": [
      "Bounded reviewed fixture in a non-disposable Default environment only",
      "No publication, app-role association, persona runtime, managed import or cross-environment ALM proof",
      "No destructive operations, update/revoke/depth-reduction or assignment promotion"
    ]
  }
] as const;
