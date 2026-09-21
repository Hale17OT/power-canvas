"""Index an unmanaged solution ZIP without extraction or remote operations.
Usage: python scripts/index-flow-export.py solution.zip index.json
"""
import hashlib
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def xml(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('DTD/entity declarations are not accepted')
    return ET.fromstring(data)


def bounded(archive, name):
    info = archive.getinfo(name)
    if info.file_size > 128 * 1024 * 1024:
        raise ValueError('Archive entry exceeds validation limit')
    return archive.read(name)


def walk(value):
    if isinstance(value, dict):
        for k, v in value.items():
            if k.lower() in ('workflowid', 'flowid', 'workflowentityid') and isinstance(v, str):
                yield v.lower().strip('{}')
            yield from walk(v)
    elif isinstance(value, str) and value.startswith(('{', '[')):
        try:
            yield from walk(json.loads(value))
        except (ValueError, TypeError):
            pass
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)


def index(path):
    data = Path(path).read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        solution = xml(bounded(archive, 'solution.xml')).find('SolutionManifest')
        custom = xml(bounded(archive, 'customizations.xml'))
        result = dict(archiveHash=hashlib.sha256(data).hexdigest(), solution=solution.findtext('UniqueName'),
                      managed=solution.findtext('Managed') != '0', workflows=[], connectionReferences=[],
                      environmentVariables=[], environmentValues={}, tables=[], canvasReferences=[])
        for w in custom.findall('./Workflows/Workflow'):
            if w.findtext('Category') != '5':
                continue
            name = w.findtext('JsonFileName').lstrip('/')
            result['workflows'].append(dict(id=w.attrib['WorkflowId'].strip('{}').lower(),
                                           logicalName=w.findtext('UniqueName'), clientdata=json.loads(bounded(archive, name))))
        for node in custom.iter():
            if node.tag.lower() == 'connectionreference':
                result['connectionReferences'].append(node.attrib.get('connectionreferencelogicalname') or node.findtext('connectionreferencelogicalname'))
            if node.tag.lower() == 'environmentvariabledefinition':
                result['environmentVariables'].append(node.attrib.get('schemaname') or node.findtext('schemaname'))
        for name in archive.namelist():
            normalized = name.replace('\\', '/')
            if normalized.endswith('/environmentvariabledefinition.xml'):
                node = xml(bounded(archive, name))
                result['environmentVariables'].append(node.attrib['schemaname'])
            elif normalized.endswith('/connectionreference.xml'):
                node = xml(bounded(archive, name))
                result['connectionReferences'].append(node.attrib['connectionreferencelogicalname'])
            elif normalized.endswith('/environmentvariablevalues.json'):
                rows = json.loads(bounded(archive, name))['environmentvariablevalues']['environmentvariablevalue']
                rows = rows if isinstance(rows, list) else [rows]
                result['environmentValues'][normalized.split('/')[-2]] = [row['value'] for row in rows]
        result['environmentVariables'] = sorted(set(result['environmentVariables']))
        result['connectionReferences'] = sorted(set(result['connectionReferences']))
        result['tables'] = [e.findtext('Name') for e in custom.findall('./Entities/Entity')]
        for app in custom.findall('./CanvasApps/CanvasApp'):
            document = app.findtext('DocumentUri')
            if not document:
                continue
            with zipfile.ZipFile(io.BytesIO(bounded(archive, document.lstrip('/')))) as msapp:
                ids = set()
                for name in ('Properties.json', 'References/DataSources.json', 'References\\DataSources.json'):
                    if name in msapp.namelist():
                        ids.update(walk(json.loads(bounded(msapp, name))))
                result['canvasReferences'].append(dict(logicalName=app.findtext('Name'), workflowIds=sorted(ids)))
        return result


if __name__ == '__main__':
    result = index(sys.argv[1])
    with open(sys.argv[2], 'x', encoding='utf-8') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps(dict(archiveHash=result['archiveHash'], workflows=len(result['workflows']), remoteWrites=0)))
