import os

files_to_fix = [
    "ConflictMatrixView.vue",
    "OutlineView.vue",
    "RelationshipsView.vue",
    "KnowledgeBaseView.vue",
    "QualityReviewView.vue",
    "WritingView.vue",
    "StoryBibleView.vue",
    "ProjectHomeView.vue"
]

base_path = "/Users/lhw/code/ai-novel/apps/web/src/views/"

slot_content = """    <template #topbar-left>
      <div class="flex items-center gap-4">
        <router-link
          to="/"
          class="flex items-center gap-2 text-text-muted transition-colors hover:text-primary"
          title="返回书库"
        >
          <ArrowLeft :size="20" />
        </router-link>

        <div class="h-6 w-px bg-border-light" />

        <router-link
          :to="`/project/${projectId}`"
          class="text-base text-text-primary font-semibold transition-colors hover:text-primary"
        >
          {{ projectStore.currentProject?.title || 'Loading...' }}
        </router-link>
      </div>
    </template>"""

for filename in files_to_fix:
    path = os.path.join(base_path, filename)
    if not os.path.exists(path):
        continue
    
    with open(path, 'r') as f:
        content = f.read()
    
    # 1. Clean up duplicate projectId if any
    import re
    content = re.sub(r':project-id="projectId"\s*:project-id="projectId"', ':project-id="projectId"', content)
    
    # 2. Add ArrowLeft import if missing
    if 'ArrowLeft' not in content:
        content = content.replace('ChevronLeft,', 'ArrowLeft,\n  ChevronLeft,')
        if 'ArrowLeft' not in content:
             content = content.replace('import {', 'import {\n  ArrowLeft,')

    # 3. Inject slot
    if '<template #topbar-left>' not in content:
        # Replace the opening tag of NAppLayout and add slot
        pattern = r'(<NAppLayout[^>]*:project-id="projectId"[^>]*>)\s*(<template #nav>)'
        replacement = r'\1\n' + slot_content + r'\n\2'
        content = re.sub(pattern, replacement, content)
        
        # Another pattern if project-id is before project-name
        if '<template #topbar-left>' not in content:
            pattern = r'(<NAppLayout[^>]*:project-name="[^"]*"[^>]*>)\s*(<template #nav>)'
            content = re.sub(pattern, replacement, content)

    with open(path, 'w') as f:
        f.write(content)

