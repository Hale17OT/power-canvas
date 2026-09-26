import {inflateRawSync} from 'node:zlib';

/** Bounded read-only ZIP inspection. Never extract archive paths or execute archive contents. */
export function zipEntries(bytes:Buffer):Map<string,Buffer>{
 if(bytes.length>256*1024*1024)throw Error('Archive exceeds 256 MiB inspection limit');
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(bytes.readUInt32LE(p)===0x06054b50&&p+22+bytes.readUInt16LE(p+20)===bytes.length){end=p;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('Invalid or multipart ZIP');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12);let offset=bytes.readUInt32LE(end+16),total=0;
 if(count===65535||count>10000||offset+size!==end)throw Error('Unsupported ZIP64 or central directory');
 const result=new Map<string,Buffer>();
 for(let i=0;i<count;i++){
  if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid ZIP directory entry');
  const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),length=bytes.readUInt32LE(offset+24),nameSize=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
  if(flags&1||![0,8].includes(method)||length>32*1024*1024||(total+=length)>256*1024*1024||offset+46+nameSize+extra+comment>end)throw Error('Unsupported or oversized ZIP entry');
  const name=bytes.subarray(offset+46,offset+46+nameSize).toString('utf8');
  if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||result.has(name))throw Error('Unsafe or duplicate ZIP path');
  if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)throw Error('Invalid ZIP local header');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+compressed>offset)throw Error('Invalid ZIP data bounds');
  const data=bytes.subarray(start,start+compressed),value=method===8?inflateRawSync(data,{maxOutputLength:32*1024*1024}):data;if(value.length!==length)throw Error('ZIP size mismatch');
  result.set(name,value);offset+=46+nameSize+extra+comment;
 }
 if(offset!==end)throw Error('ZIP directory length mismatch');return result;
}
