import type { OrcaVmRecipe } from '../../../../shared/orca-yaml-hook-types'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import type { WorkspaceCreationTargetResolution } from '@/lib/project-host-workspace-target'

/** The VM recipe a quick create provisions, once the workspace target names its project. */
export function buildQuickEphemeralVmRecipe(
  repoId: string,
  recipeId: string | null,
  recipes: readonly OrcaVmRecipe[],
  workspaceTarget: WorkspaceCreationTargetResolution
): WorktreeCreationRequest['ephemeralVmRecipe'] {
  if (!recipeId || workspaceTarget.status !== 'ready') {
    return undefined
  }
  const selectedRecipe = recipes.find((recipe) => recipe.id === recipeId)
  return {
    sourceRepoId: repoId,
    recipeId,
    projectId: workspaceTarget.target.projectId,
    ...(selectedRecipe?.checkoutMode ? { checkoutMode: selectedRecipe.checkoutMode } : {})
  }
}
