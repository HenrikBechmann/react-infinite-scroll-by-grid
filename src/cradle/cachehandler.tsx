// portalhandler.tsx

/*
    The infinite list scroller stores user cell data in a central hidden portal cache for each
    infinitegridscroller root, from whence the data is pulled into the relevant CellFrame for display
*/

import React, {useState, useEffect, useRef} from 'react'
import ReactDOM from 'react-dom'

import { createHtmlPortalNode, InPortal } from 'react-reverse-portal'

const MAX_CACHE_OVER_RUN = 1.5

let globalCacheItemID = 0


// global scroller data, organized by session scrollerID
// the cache itself is maintained in the root infinitegridscroller component
export class CacheHandler {

    constructor(scrollerID, setListsize, listsizeRef) {
        this.cacheProps.scrollerID = scrollerID
        this.setListsize = setListsize // passed from infinitegridscroller setListsize(listsize)
        this.listsizeRef = listsizeRef
    }

    //===========================[ REPOSITORY AND LIST MANAGEMENT ]==================================

    cacheProps = {
        setListState:null,
        modified:false,

        metadataMap:new Map(),
        requestedMap: new Map(), // some portals may have been requested by requestidlecallback, not yet created
        portalMap:new Map(),
        indexToItemIDMap:new Map(),

        portalList:null,

        scrollerID:null
    }

    listsizeRef
    // initialize scroller repository

    setListsize // setListsize(listsize) generates infinitescroller useEvent to update listsize throughout

    changeListsize = (newlistsize, cacheDeleteListCallback) => {
        this.setListsize(newlistsize)
        // match cache to newlistsize
        const portalIndexList = this.cacheProps.indexToItemIDMap
        const mapkeys = Array.from(portalIndexList.keys())
        mapkeys.sort((a,b) => a - b)
        const highestindex = mapkeys.at(-1)
        if (highestindex > (newlistsize -1)) { // pare the cache
            const parelist = mapkeys.filter((item)=>{
                return item > (newlistsize -1)
            })
            this.deletePortal(parelist, cacheDeleteListCallback)
        }
    }

    // changeMap is [key, value] pair of [cacheItemID, index]
    // index = null means delete the item from cache
    applyMappingChanges = (changeMap) => {

    }

    clearCache = () => {

        // keep the setListState callback
        this.cacheProps.portalMap.clear() 
        this.cacheProps.metadataMap.clear()
        this.cacheProps.indexToItemIDMap.clear()
        this.cacheProps.requestedMap.clear()
        this.cacheProps.portalList = null
        this.cacheProps.modified = false

        this.cacheProps.setListState() // trigger display update

    }

    // set state of the PortalList component of the scroller to trigger render
    renderPortalList = () => {

        if (this.cacheProps.modified) {
            this.cacheProps.portalList = Array.from(this.cacheProps.portalMap.values())
            this.cacheProps.modified = false
        }

        this.cacheProps.setListState() // trigger display update

    }

    matchCacheToCradle = (modelIndexList, cacheDeleteListCallback) => {

        const mapkeys = Array.from(this.cacheProps.indexToItemIDMap.keys())

        mapkeys.filter(key => !modelIndexList.includes(key))

        this.deletePortal(mapkeys, cacheDeleteListCallback)

    }

    pareCacheToMax = (cacheMax, modelIndexList, cacheDeleteListCallback) => {

        const modelLength = modelIndexList.length

        // determine need for paring
        if ((!cacheMax) || (!modelLength)) return false

        const max = Math.max(modelLength, cacheMax)

        const portalIndexList = this.cacheProps.indexToItemIDMap
        const requestedMap = this.cacheProps.requestedMap

        // if ((portalMapList.size + requestedMap.size) <= max) return false
        if ((portalIndexList.size + requestedMap.size) <= max) return false

        // sort the map keys
        const mapkeyslist = Array.from(portalIndexList.keys())
        const requestedkeys = Array.from(requestedMap.keys())

        const mapkeys = mapkeyslist.concat(requestedkeys)

        mapkeys.sort((a,b) => a - b)

        // get number to pare
        const mapLength = mapkeys.length
        const parecount = mapLength - max

        // distribute paring proportionally at front and back
        const headindex = modelIndexList[0]
        const tailindex = modelIndexList[modelLength - 1]
        const headpos = mapkeys.indexOf(headindex)
        const tailpos = mapkeys.indexOf(tailindex)

        const headroom = headpos
        const tailroom = mapLength - (tailpos + 1)
        const pareroom = headroom + tailroom

        const headparecount = Math.floor((headroom/pareroom)*parecount)
        const tailparecount = parecount - headparecount

        // collect indexes to pare
        const headlist = mapkeys.slice(0,headparecount)
        const taillist = mapkeys.slice(mapLength - tailparecount)

        const delList = headlist.concat(taillist)

        this.deletePortal(delList, cacheDeleteListCallback)

        return true

    }

    guardAgainstRunawayCaching = (cacheMax, modelLength) => {

        if (!cacheMax) return false

        const portalMap = this.cacheProps.portalMap
        const requestedMap = this.cacheProps.requestedMap

        const max = Math.max(modelLength, cacheMax)

        if ((portalMap.size + requestedMap.size) <= ((max) * MAX_CACHE_OVER_RUN)) {
            return false
        } else {
            return true
        }

    }

    preload(cradleParameters, callback, scrollerID) {

        const { cradlePassthroughPropertiesRef } = cradleParameters
        const { stateHandler, serviceHandler } = cradleParameters.handlersRef.current

        const cradleInheritedProperties = cradleParameters.cradleInheritedPropertiesRef.current
        const cradleInternalProperties = cradleParameters.cradleInternalPropertiesRef.current
        const { getItem } = cradleInheritedProperties
        const { listsize } = cradleInternalProperties

        const promises = []

        if (stateHandler.isMountedRef.current) {

            for (let i = 0; i < listsize; i++) {
                // console.log('preloading',i)
                const promise = this.preloadItem(
                    i, 
                    getItem, 
                    cradlePassthroughPropertiesRef,
                    serviceHandler.callbacks.preloadIndexCallback,
                    scrollerID
                )
                promises.push(promise)
            }
        }

        Promise.all(promises).then(
            ()=>{
                // console.log("finished preloading",'-'+scrollerID+'-',+this.cacheProps.portalMap.size)
                callback()
            }
        )

    }

    getCacheMap() {

        return new Map(this.cacheProps.indexToItemIDMap)

    }

    getCradleMap(modelIndexList) {

        const cradleMap = new Map()
        const { indexToItemIDMap } = this.cacheProps
        for (const index of modelIndexList) {

            cradleMap.set(index, indexToItemIDMap.get(index))

        }

        return cradleMap

    }

    getCacheList() {

        const cachelist = new Map()

        for (const [key, value] of this.cacheProps.metadataMap) {
            const {
                index,
                component,
            } = value

            cachelist.set(key,{
                index,
                component,
            })

        }

        return cachelist

    }
    // ==========================[ INDIVIDUAL PORTAL MANAGEMENT ]============================

    // used for size calculation in pareCacheToMax
    // registers indexes when requested but before retrieved and entered into cache
    registerRequestedPortal(index) {

        this.cacheProps.requestedMap.set(index, null)

    }

    removeRequestedPortal(index) {

        this.cacheProps.requestedMap.delete(index)

    }

    getCacheItemID(index) {

        const indexMap = this.cacheProps.indexToItemIDMap 
        const knownID = indexMap.get(index)
        const knownHasValue = knownID??false // deal with falsey 0
        const newID = (knownHasValue === false)?(globalCacheItemID++):null

        if (knownHasValue === false) indexMap.set(index, newID)

        return knownID??newID

    }

    createPortal(component, index, cacheItemID) { // create new portal

        this.removeRequestedPortal(index)

        // console.log('creating portal for index','-'+this.cacheProps.scrollerID+'-', index)
        const portalNode = createPortalNode(index, cacheItemID)

        // console.log('creating InPortal node', '-'+this.cacheProps.scrollerID+'-', cacheItemID)

        this.cacheProps.portalMap.set(cacheItemID,//index,
                <InPortal key = {cacheItemID} node = {portalNode} > { component } </InPortal>)
                // <InPortal key = {index} node = {portalNode} > { content } </InPortal>)
        this.cacheProps.modified = true

        const portalMetadata = {
            portalNode,
            isReparentingRef:{
                current:false,
            },
            index,
            cacheItemID,
            component,
        }

        this.cacheProps.metadataMap.set(cacheItemID, portalMetadata)
        this.cacheProps.indexToItemIDMap.set(index, cacheItemID)

        this.renderPortalList()

        return portalMetadata

    }

    private async preloadItem(index, 
        getItem, 
        cradlePassthroughPropertiesRef, 
        preloadIndexCallback,
        scrollerID
    ) {

        const cacheItemID = this.getCacheItemID(index)

        const usercontent = await getItem(index, cacheItemID)

        if (usercontent) {

            preloadIndexCallback && preloadIndexCallback(index, cacheItemID)

            // console.log('preloading index','-'+scrollerID+'-' ,index )

            let content 
            const scrollerData = {
                isReparentingRef:null,
                cradlePassthroughPropertiesRef,
            }
            if (usercontent.props.hasOwnProperty('scrollerData')) {
                content = React.cloneElement(usercontent, {scrollerData})
            } else {
                content = usercontent
            }

            const portalData = 
                this.createPortal(content, index, cacheItemID)
            // make available to user content
            scrollerData.isReparentingRef = portalData.isReparentingRef

        } else {

            preloadIndexCallback && preloadIndexCallback(index, cacheItemID, 'error')
            console.log('ERROR','no content item for preload index, cacheItemID',index, cacheItemID)

        }

    }

    // delete a portal list item
    // accepts an array of indexes
    deletePortal(index, cacheDeleteListCallback) {

        let indexArray
        if (!Array.isArray(index)) {
            indexArray = [index]
        } else {
            indexArray = index
        }

        const { 
            metadataMap,
            portalMap,
            indexToItemIDMap 
        } = this.cacheProps
        const deleteList = []
        for (let i of indexArray) {
            const cacheItemID = indexToItemIDMap.get(i)
            deleteList.push(cacheItemID)
            metadataMap.delete(cacheItemID)
            portalMap.delete(cacheItemID)
            indexToItemIDMap.delete(i)
        }
        this.cacheProps.modified = true

        cacheDeleteListCallback && cacheDeleteListCallback(deleteList)

    }

    // query existence of a portal list item
    hasPortal(cacheItemID) {

        return this.cacheProps.metadataMap.has(cacheItemID)

    }

    getPortal(cacheItemID) {

        if (this.hasPortal(cacheItemID)) {
            return this.cacheProps.metadataMap.get(cacheItemID)
        }

    }

}

// ==========================[ Utility function ]============================

// get a react-reverse-portal InPortal component, with its metadata
// with user content and container
const createPortalNode = (index, cacheItemID) => {

    let portalNode = createHtmlPortalNode()

    let container = portalNode.element
    container.style.inset = '0px' 
    container.style.position = 'absolute'
    // container.style.height = '100%'
    // container.style.width = '100%'
    container.dataset.type = 'contentenvelope'
    container.dataset.index = index
    container.dataset.cacheitemid = cacheItemID

    return portalNode

}     

// ========================[ Utility component ]==============================

// portal list component for rapid relisting of updates, using external callback for set state
export const PortalList = ({ cacheProps }) => {

    // console.log('running PORTALLIST', '-'+cacheProps.scrollerID+'-')

    const [portalList, setPortalList] = useState(null)
    const isMountedRef = useRef(true)

    useEffect(()=>{

        cacheProps.setListState = ()=>{

            isMountedRef.current && setPortalList(cacheProps.portalList)

        }

        return () => {isMountedRef.current = false}

    },[]) 

    return portalList
}
