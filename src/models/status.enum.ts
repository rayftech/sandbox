/**
 * Enum for item lifecycle status
 * Used across Course, Project, and Partnership entities
 */
export enum ItemLifecycleStatus {
    UPCOMING = 'upcoming',   // Not yet started based on dates
    ONGOING = 'ongoing',     // Currently active based on dates
    COMPLETED = 'completed'  // Finished based on dates or manual completion
  }
  
  /**
   * Helper function to determine item status based on dates
   * @param startDate Start date of the item
   * @param endDate End date of the item
   * @param isCompleted Optional flag to manually mark as completed
   * @returns The appropriate ItemLifecycleStatus
   */
  export function determineItemStatus(
    startDate: Date, 
    endDate: Date, 
    isCompleted?: boolean
  ): ItemLifecycleStatus {
    if (isCompleted) {
      return ItemLifecycleStatus.COMPLETED;
    }
    
    const now = new Date();
    
    if (now < startDate) {
      return ItemLifecycleStatus.UPCOMING;
    } else if (now > endDate) {
      return ItemLifecycleStatus.COMPLETED;
    } else {
      return ItemLifecycleStatus.ONGOING;
    }
  }