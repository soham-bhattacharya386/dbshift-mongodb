import 'dotenv/config';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import multer from 'multer';
import pkg from 'node-sql-parser';
const { Parser } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';
const app=express();app.use(express.json({limit:'2mb'}));app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'public')));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:2}});
const client=new MongoClient(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017');let db;
const col=()=>db.collection('migrationProjects');
const err=(res,e)=>res.status(400).json({error:e.message||'Invalid request'});
const oid=(s)=>{if(!ObjectId.isValid(s))throw Error('Invalid project ID');return new ObjectId(s)};
const normalize=(d)=>({...d,id:d._id.toString(),_id:undefined});
const parser=new Parser();
function analyze(sql,logs){
 const tables=[];const statements=sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
 for(const statement of statements){if(!/^CREATE\s+TABLE\b/i.test(statement))continue;
 const nameMatch=statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"]?\w+[`"]?\.)?[`"]?([\w]+)[`"]?\s*\(/i);if(!nameMatch)continue;
 const name=nameMatch[1];const body=statement.slice(statement.indexOf('(',nameMatch.index)+1,statement.lastIndexOf(')'));
 const parts=body.split(/,(?![^()]*\))/).map(x=>x.trim());const columns=[],foreignKeys=[];let primary=[];
 for(const part of parts){let m=part.match(/^(?:CONSTRAINT\s+[`"]?\w+[`"]?\s+)?FOREIGN\s+KEY\s*\([`"]?(\w+)[`"]?\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\([`"]?(\w+)[`"]?\)/i);if(m){foreignKeys.push({column:m[1],references:m[2],targetColumn:m[3]});continue}
 m=part.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);if(m){primary=m[1].split(',').map(s=>s.replace(/[`"\s]/g,''));continue}
 m=part.match(/^[`"]?(\w+)[`"]?\s+([\w]+(?:\([^)]*\))?)/);if(m&&!/^(KEY|INDEX|UNIQUE|CHECK|CONSTRAINT)$/i.test(m[1])){columns.push({name:m[1],type:m[2]});if(/PRIMARY\s+KEY/i.test(part))primary.push(m[1]);let r=part.match(/REFERENCES\s+[`"]?(\w+)[`"]?\s*\([`"]?(\w+)[`"]?\)/i);if(r)foreignKeys.push({column:m[1],references:r[1],targetColumn:r[2]})}}
 tables.push({name,columns,primaryKeys:[...new Set(primary)],foreignKeys,gaf:0,uaf:0,readQueries:0,updateQueries:0});
 }
 if(!tables.length)throw Error('No CREATE TABLE statements found. Upload a schema SQL file.');
 const lines=logs.split(/\r?\n/);for(const line of lines){let type=line.match(/\b(SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1]?.toUpperCase();if(!type)continue;let names=new Set();
 try{const ast=parser.astify(line.slice(line.search(/\b(SELECT|INSERT|UPDATE|DELETE)\b/i)).replace(/;?$/,';'),{database:'MySQL'});const obj=Array.isArray(ast)?ast[0]:ast;const walk=(v)=>{if(!v||typeof v!=='object')return;if(v.table&&typeof v.table==='string')names.add(v.table);for(const k of Object.keys(v))if(k!=='table')walk(v[k])};walk(obj)}catch{}
 for(const t of tables)if(names.has(t.name)||new RegExp('\\b'+t.name+'\\b','i').test(line)){if(type==='SELECT')t.readQueries++;else t.updateQueries++;t.gaf++;if(type!=='SELECT')t.uaf++}
 }
 // Educational approximation: counts query occurrences, not the paper's row-weighted access frequency.
 const total=tables.reduce((s,t)=>s+t.gaf,0),threshold=total*0.01125;
 const decisions=tables.map(t=>{let mode='collection',reason='Root table';if(t.foreignKeys.some(f=>f.references===t.name)){mode='reference';reason='Self-referencing relationship'}else if(t.foreignKeys.length>2){mode='reference';reason='More than two foreign keys'}else if(t.foreignKeys.length&&t.uaf<threshold){mode=t.foreignKeys.length===1?'embed-one':'embed-two';reason='Low observed update frequency'}else if(t.foreignKeys.length){mode='reference';reason='Updates may make embedding costly'}return{table:t.name,mode,reason,targets:t.foreignKeys.map(f=>f.references)}});
 const sample=tables.map(t=>({collection:t.name,document:Object.fromEntries(t.columns.map(c=>[c.name,/int|decimal|float|double|numeric/i.test(c.type)?0:/bool/i.test(c.type)?false:`sample_${c.name}`]))}));
 return{tables,decisions,sample,metrics:{tableCount:tables.length,relationCount:tables.reduce((s,t)=>s+t.foreignKeys.length,0),queryCount:tables.reduce((s,t)=>s+t.readQueries+t.updateQueries,0),threshold,mode:'Educational heuristic (query counts; not paper-exact GAF/UAF)'}};
}
app.get('/api/health',(_,res)=>res.json({ok:true,database:'connected'}));
app.get('/api/projects',async(_,res)=>{try{res.json((await col().find({}, {projection:{sourceSql:0,queryLogs:0}}).sort({updatedAt:-1}).toArray()).map(normalize))}catch(e){err(res,e)}});
app.get('/api/projects/:id',async(req,res)=>{try{const p=await col().findOne({_id:oid(req.params.id)});if(!p)return res.status(404).json({error:'Not found'});res.json(normalize(p))}catch(e){err(res,e)}});
app.post('/api/projects',async(req,res)=>{try{const name=String(req.body.name||'').trim().slice(0,100);if(!name)throw Error('Project name required');const now=new Date();const p={name,sourceType:['MySQL','PostgreSQL'].includes(req.body.sourceType)?req.body.sourceType:'MySQL',status:'Draft',createdAt:now,updatedAt:now};const r=await col().insertOne(p);res.status(201).json(normalize({...p,_id:r.insertedId}))}catch(e){err(res,e)}});
app.patch('/api/projects/:id',async(req,res)=>{try{const name=String(req.body.name||'').trim().slice(0,100);if(!name)throw Error('Name required');await col().updateOne({_id:oid(req.params.id)},{$set:{name,updatedAt:new Date()}});res.json({ok:true})}catch(e){err(res,e)}});
app.delete('/api/projects/:id',async(req,res)=>{try{await col().deleteOne({_id:oid(req.params.id)});res.json({ok:true})}catch(e){err(res,e)}});
app.post('/api/projects/:id/analyze',upload.fields([{name:'schema',maxCount:1},{name:'logs',maxCount:1}]),async(req,res)=>{try{const schema=req.files?.schema?.[0]?.buffer.toString('utf8')||req.body.schema||'';const logs=req.files?.logs?.[0]?.buffer.toString('utf8')||req.body.logs||'';if(!schema)throw Error('SQL schema is required');const result=analyze(schema,logs);await col().updateOne({_id:oid(req.params.id)},{$set:{sourceSql:schema.slice(0,100000),queryLogs:logs.slice(0,100000),analysis:result,status:'Analyzed',updatedAt:new Date()}});res.json(result)}catch(e){err(res,e)}});
app.post('/api/projects/:id/documents',async(req,res)=>{try{const documents=req.body.documents;if(!Array.isArray(documents)||documents.length>100)throw Error('Expected array of up to 100 documents');await col().updateOne({_id:oid(req.params.id)},{$set:{savedDocuments:documents,status:'Saved',updatedAt:new Date()}});res.json({ok:true})}catch(e){err(res,e)}});
app.use((e,req,res,next)=>res.status(400).json({error:e.message}));
try{await client.connect();db=client.db(process.env.MONGODB_DB||'dbshift');await db.command({ping:1});app.listen(process.env.PORT||3000,()=>console.log(`DBShift running at http://localhost:${process.env.PORT||3000}`))}catch(e){console.error('MongoDB connection failed:',e.message);process.exit(1)}
