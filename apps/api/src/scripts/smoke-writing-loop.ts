import process from 'node:process'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { characters, novelProjects, storyBibles } from '../db/schema'
import { exportProjectData, importProjectData } from '../services/export-import.service'
import { generateId, now } from '../utils'

async function runSmokeTest() {
  console.log('🚀 Starting Smoke Test: Writing Loop & Data Portability')

  const projectId = generateId()
  const timestamp = now()

  try {
    // 1. Create Project
    console.log('--- Phase 1: Create Project ---')
    await db.insert(novelProjects).values({
      id: projectId,
      title: 'Smoke Test Project',
      genre: 'Sci-Fi',
      status: 'planning',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    console.log(`✅ Project created: ${projectId}`)

    // 2. Add Story Bible
    console.log('--- Phase 2: Add Story Bible ---')
    await db.insert(storyBibles).values({
      id: generateId(),
      projectId,
      worldview: 'A city inside a mirror.',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // 3. Add Character
    console.log('--- Phase 3: Add Character ---')
    const charId = generateId()
    await db.insert(characters).values({
      id: charId,
      projectId,
      name: 'Test Character',
      role: 'protagonist',
      personality: 'Brave',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    // 4. Export Project
    console.log('--- Phase 4: Export Project ---')
    const exportData = await exportProjectData(projectId)
    if ((exportData.project as any).id !== projectId)
      throw new Error('Export ID mismatch')
    if (exportData.characters.length !== 1)
      throw new Error('Export characters count mismatch')
    console.log('✅ Export successful')

    // 5. Import Project (as a new project)
    console.log('--- Phase 5: Import Project ---')
    const importResult = await importProjectData(exportData)
    const newProjectId = importResult.projectId
    console.log(`✅ Imported as new project: ${newProjectId}`)

    // 6. Verify Import
    console.log('--- Phase 6: Verify Imported Data ---')
    const [importedProject] = await db.select().from(novelProjects).where(eq(novelProjects.id, newProjectId))
    if (!importedProject)
      throw new Error('Imported project not found in DB')

    const importedChars = await db.select().from(characters).where(eq(characters.projectId, newProjectId))
    if (importedChars.length !== 1)
      throw new Error('Imported characters count mismatch')
    console.log('✅ Data integrity verified')

    // 7. Cleanup
    console.log('--- Phase 7: Cleanup ---')
    await db.delete(novelProjects).where(eq(novelProjects.id, projectId))
    await db.delete(novelProjects).where(eq(novelProjects.id, newProjectId))
    console.log('✅ Cleanup successful')

    console.log('\n✨ Smoke Test Passed! ✨')
    process.exit(0)
  }
  catch (error) {
    console.error('\n❌ Smoke Test Failed! ❌')
    console.error(error)

    // Attempt cleanup even on failure
    try {
      await db.delete(novelProjects).where(eq(novelProjects.id, projectId))
    }
    catch {}

    process.exit(1)
  }
}

runSmokeTest()
