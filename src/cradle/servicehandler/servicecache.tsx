// servicecache.tsx
// copyright (c) 2019-2023 Henrik Bechmann, Toronto, Licence: MIT

/*

    This module contains clearCache, moveIndex, insertIndex, removeIndex

*/

import {
    isBlank,
    isNumber,
    isInteger,
    isValueGreaterThanOrEqualToMinValue,
    isValueLessThanToOrEqualToMaxValue,
    errorMessages,
} from '../servicehandler'

export default class ServiceCache {

    constructor(cradleParameters, setListRange) {

        this.cradleParameters = cradleParameters
        this.setListRange = setListRange

    }

    cradleParameters
    setListRange
    // serviceHandler

    public clearCache = () => {

        const { stateHandler } = this.cradleParameters.handlersRef.current

        stateHandler.setCradleState('clearcache')

    }

    // move must be entirely within list bounds
    // returns list of processed indexes
    public moveIndex = (tolowindex, fromlowindex, fromhighindex = null) => {

        const 

            { cradleParameters } = this,

            cradleInternalProperties = cradleParameters.cradleInternalPropertiesRef.current,

            { scrollerID } = cradleParameters.cradleInheritedPropertiesRef.current,

            { virtualListProps } = cradleInternalProperties,

            { lowindex:listlowindex, size } = virtualListProps

        if (!size) return

        // ------------ confirm validity of arguments -------------

        const 
            isToindexInvalid = (!isInteger(tolowindex) || !isValueGreaterThanOrEqualToMinValue(tolowindex, listlowindex)),
            isFromindexInvalid = (!isInteger(fromlowindex) || !isValueGreaterThanOrEqualToMinValue(fromlowindex, listlowindex))

        let isHighrangeInvalid = false

        if ((!isFromindexInvalid)) {
            if (!isBlank(fromhighindex)) {
                isHighrangeInvalid = !isValueGreaterThanOrEqualToMinValue(fromhighindex, fromlowindex)
            } else {
                fromhighindex = fromlowindex
            }
        }


        tolowindex = +tolowindex
        fromlowindex = +fromlowindex
        fromhighindex = +fromhighindex

        // TODO return error array instead
        if (isToindexInvalid || isFromindexInvalid || isHighrangeInvalid) {
            console.log('RIGS ERROR moveIndex(toindex, fromindex, fromhighrange)')
            isToindexInvalid && console.log(tolowindex, errorMessages.moveTo)
            isFromindexInvalid && console.log(fromlowindex, errorMessages.moveFrom)
            isHighrangeInvalid && console.log(fromhighindex, errorMessages.moveRange)
            return []
        }

        tolowindex = Math.max(listlowindex,tolowindex)
        fromlowindex = Math.max(listlowindex,fromlowindex)
        fromhighindex = Math.max(listlowindex,fromhighindex)

        const fromspan = fromhighindex - fromlowindex + 1

        let tohighindex = tolowindex + fromspan - 1

        // ------------- coerce parameters to list bounds ---------------

        const listsize = this.cradleParameters.cradleInternalPropertiesRef.current.virtualListProps.size

        // keep within current list size
        const listhighindex = listsize - 1

        if (tohighindex > listhighindex) {

            const diff = tohighindex - listhighindex
            tohighindex = Math.max(listlowindex,tohighindex - diff)
            tolowindex = Math.max(listlowindex,tolowindex - diff)

        }

        if (fromhighindex > listhighindex) {

            const diff = fromhighindex - listhighindex
            fromhighindex = Math.max(listlowindex,fromhighindex - diff)
            fromlowindex = Math.max(listlowindex,fromlowindex - diff)

        }

        // ---------- constrain parameters --------------

        // nothing to do; no displacement
        if (fromlowindex == tolowindex) return [] 

        // ----------- perform cache and cradle operations -----------

        const 
            { cacheAPI, contentHandler, stateHandler } = 
                this.cradleParameters.handlersRef.current,

            [processedIndexList, movedDataList, displacedDataList] = // both displaced and moved indexes
                cacheAPI.moveIndex(tolowindex, fromlowindex, fromhighindex)

        if (processedIndexList.length) {

            contentHandler.synchronizeCradleItemIDsToCache(processedIndexList)

            const { content } = contentHandler

            content.headModelComponents = content.cradleModelComponents.slice(0,content.headModelComponents.length)
            content.tailModelComponents = content.cradleModelComponents.slice(content.headModelComponents.length)

            stateHandler.setCradleState('applymovechanges')
            
        }

        return [ processedIndexList, movedDataList, displacedDataList ,{
            contextType:'moveIndex',
            scrollerID,
        }]

    }

    public insertIndex = (index, rangehighindex = null) => {

        const 
            { cradleParameters } = this,
            { scrollerID } = cradleParameters.cradleInheritedPropertiesRef.current,
            cradleInternalProperties = cradleParameters.cradleInternalPropertiesRef.current,
            { virtualListProps } = cradleInternalProperties,
            { lowindex:listlowindex, size } = virtualListProps

        let isIndexInvalid = !isInteger(index)

        // if (!isIndexInvalid) {

        //     if (size) {

        //         isIndexInvalid = !isValueGreaterThanOrEqualToMinValue(index, listlowindex)

        //     } else {

        //         isIndexInvalid = false

        //     }
        // }

        let isHighrangeInvalid = false

        if ((!isIndexInvalid)) {

            if (!isBlank(rangehighindex)) {

                isHighrangeInvalid = !isValueGreaterThanOrEqualToMinValue(rangehighindex, index)

            } else {

                rangehighindex = index

            }
        }

        index = +index
        rangehighindex = +rangehighindex

        if (isNaN(index)) isIndexInvalid = true
        if (isNaN(rangehighindex)) isHighrangeInvalid = true

        if (isIndexInvalid || isHighrangeInvalid) {

            console.log('RIGS ERROR insertIndex(index, rangehighindex)')
            isIndexInvalid && console.log(index, errorMessages.insertFrom)
            isHighrangeInvalid && console.log(rangehighindex, errorMessages.insertRange)
            return null

        }

        // assure contiguous range
        if (rangehighindex < (listlowindex - 1)) {

            const diff = (listlowindex - rangehighindex) - 1
            index += diff
            rangehighindex += diff

        }

        const changes = this.insertOrRemoveIndex(index, rangehighindex, +1)

        return [changes, {
            contextType:'insertIndex',
            scrollerID
        }]

    }

    public removeIndex = (index, rangehighindex = null) => {

        const 
            { cradleParameters } = this,
            cradleInternalProperties = cradleParameters.cradleInternalPropertiesRef.current,
            { scrollerID } = cradleParameters.cradleInheritedPropertiesRef.current,
            { virtualListProps } = cradleInternalProperties,
            { lowindex:listlowindex, size } = virtualListProps

        if (!size) return

        let 
            isIndexInvalid = (!isInteger(index) || !isValueGreaterThanOrEqualToMinValue(index, listlowindex)),
            isHighrangeInvalid = false

        if ((!isIndexInvalid)) {

            if (!isBlank(rangehighindex)) {

                isHighrangeInvalid = !isValueGreaterThanOrEqualToMinValue(rangehighindex, index)

            } else {

                rangehighindex = index

            }
        }

        index = +index
        rangehighindex = +rangehighindex

        if (isNaN(index)) isIndexInvalid = true
        if (isNaN(rangehighindex)) isHighrangeInvalid = true

        if (isIndexInvalid || isHighrangeInvalid) {

            console.log('RIGS ERROR moveIndex(index, rangehighindex)')
            isIndexInvalid && console.log(index, errorMessages.removeFrom)
            isHighrangeInvalid && console.log(rangehighindex, errorMessages.removeRange)
            return null

        }

        const changes = this.insertOrRemoveIndex(index, rangehighindex, -1)

        return [changes, {
            contextType:'removeIndex',
            scrollerID,
        }]

    }

    // shared logic for insert and remove. Returns lists of indexes shifted, replaced, removed and deleted
    // this operation changes the listrange
    private insertOrRemoveIndex = (index, rangehighindex, incrementDirection) => {

        const 
            { cradleParameters } = this,
            // handlers
            { 
                cacheAPI, 
                contentHandler, 
                stateHandler, 
                serviceHandler,
            } = cradleParameters.handlersRef.current,

            cradleInternalProperties = cradleParameters.cradleInternalPropertiesRef.current,

            // list and cradle props
            { 
                virtualListProps,
                cradleContentProps, 
            } = cradleInternalProperties,
            { 
                lowindex:listlowindex, 
                crosscount, 
                size:listsize,
                range:listrange
            } = virtualListProps,
            { 
                lowindex:lowCradleIndex, 
                highindex:highCradleIndex, 
                size:cradleSize, 
                runwayRowcount:runwaySize,
                viewportRowcount,
            } = cradleContentProps

        // basic assertions
        if (listsize) index = Math.max(listlowindex,index)

        // ------------------- process cache ----------------

        if (listsize == 0) {
            
            if (incrementDirection > 0) {

                this.setListRange([index,rangehighindex])

                const replaceList = []

                for (let i = index; i<=rangehighindex; i++) {
                    replaceList.push(i)
                }

                return [[],replaceList,[],[]]

            } else {
    
                return [[],[],[],[]]
            }
        }

        const [
            startChangeIndex, 
            rangeincrement, 
            shiftedList, 
            removedList, 
            replacedList, 
            deletedList,
            portalPartitionItemsToDeleteList,
        ] = cacheAPI.insertOrRemoveIndexes(index, rangehighindex, incrementDirection, listsize)

        if (rangeincrement === null) return [[],[],[],[]] // no action

        // partitionItems to delete with followup state changes - must happen after cradle update
        cacheAPI.portalPartitionItemsToDeleteList = portalPartitionItemsToDeleteList

        const { deleteListCallback } = serviceHandler.callbacks

        deleteListCallback && deletedList.length && 
            deleteListCallback(deletedList,{
                contextType:'deleteList',
                message:"delete items from cache by index",
                scrollerID:cradleParameters.cradleInheritedPropertiesRef.current.scrollerID,
            })

        // ------------- synchronize cradle to cache changes -------------

        // determine if cradle must be reset or simply adjusted
        const 
            changecount = rangeincrement, // semantics
            // newlistsize = serviceHandler.newListSize = listsize + changecount,
            newlistsize = listsize + changecount,

            [lowindex, highindex] = listrange,
            newListRange = serviceHandler.newListRange = [lowindex, highindex + changecount],

            calculatedCradleRowcount = viewportRowcount + (runwaySize * 2),
            calculatedCradleItemcount = calculatedCradleRowcount * crosscount,

            measuredCradleItemCount = (cradleSize == 0)?0:highCradleIndex - lowCradleIndex + 1,

            resetCradle = ((measuredCradleItemCount < calculatedCradleItemcount) || 
                (highCradleIndex >= (newlistsize - 1)))

        if (!resetCradle) { // synchronize cradle contents to changes

            contentHandler.synchronizeCradleItemIDsToCache(shiftedList, incrementDirection, startChangeIndex) // non-zero communications isInsertRemove

            const 
                { content } = contentHandler,

                requestedSet = cacheAPI.requestedSet

            const timeout = setInterval(() => { // wait until changed cache entries update the cradle

                if(!requestedSet.size) { // finished collecting new cache entries

                    clearInterval(timeout); 

                    content.headModelComponents = content.cradleModelComponents.slice(0,content.headModelComponents.length)
                    content.tailModelComponents = content.cradleModelComponents.slice(content.headModelComponents.length)

                    stateHandler.setCradleState('applyinsertremovechanges')

                }
            }, 100)

        } else { // cradle to be completely reset if listsize change encroaches on cradle

            stateHandler.setCradleState('channelcradleresetafterinsertremove')

        }

        // const replacedList = replaceList // semantics

        return [shiftedList, replacedList, removedList, deletedList] // inform caller

    }
}