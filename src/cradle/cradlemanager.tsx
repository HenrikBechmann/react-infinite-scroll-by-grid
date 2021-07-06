// cradlemanager.tsx
// copyright (c) 2021 Henrik Bechmann, Toronto, Licence: MIT

import CradleManagement from './cradlemanagement'

export default class CradleManager extends CradleManagement{

    constructor(commonPropsRef, cradleElements) {

       super(commonPropsRef)

       let elements = this.elements
       elements.spineRef = cradleElements.spine
       elements.headRef = cradleElements.head
       elements.tailRef = cradleElements.tail

    }
    
    scrollReferenceIndex
    scrollSpineOffset
    
    readyReferenceIndex
    readySpineOffset
    
    nextReferenceIndex
    nextSpineOffset

    blockScrollPos:number
    blockScrollProperty:string


    elements = {
       spineRef:null, 
       headRef:null, 
       tailRef:null
    }

}